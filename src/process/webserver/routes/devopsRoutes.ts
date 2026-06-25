/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import mammoth from 'mammoth';
import { readFile } from 'node:fs/promises';
import { TokenMiddleware } from '../auth/middleware/TokenMiddleware';
import { AuthService } from '../auth/service/AuthService';
import { UserRepository } from '../auth/repository/UserRepository';
import { apiRateLimiter } from '../middleware/security';
import { AuthProviderRepository } from '../auth/repository/AuthProviderRepository';
import { getDatabase } from '@process/services/database';
import { DESKTOP_OPERATOR_USER_ID, isWebuiBuiltinAdministrator } from '@/common/auth/enterpriseRoles';
import { canUseAnonymousLocalDevops } from '@/common/config/localDevopsAccess';
import { isEnterpriseAdminRole } from '../auth/enterpriseRoles';
import { RAGService } from '@process/services/rag/RAGService';
import {
  extractHtmlText,
  fetchFeishuDocumentContentFromUrl,
  getRagErrorMessage,
  queueRagDocumentIndexing,
} from '@process/services/rag/RagDocumentImportService';
import { PipelineService } from '@process/services/pipeline/PipelineService';
import { recordDevopsAudit, DEVOPS_AUDIT_ACTIONS } from '../auth/auditLogService';
import { registerCciRoutes } from './devops/cciRoutes';
import { registerCcodeRoutes } from './devops/ccodeRoutes';
import { registerCflowRoutes } from './devops/cflowRoutes';
import { registerCmeasRoutes } from './devops/cmeasRoutes';
import { registerCpackRoutes } from './devops/cpackRoutes';
import { registerCteamRoutes } from './devops/cteamRoutes';
import { registerCtestRoutes } from './devops/ctestRoutes';
import {
  canManageScopedResource,
  getScopedResourceOrNull,
  resolveResourceScope,
  getTeamPeerUserIds,
  VISIBLE_RESOURCE_WHERE,
  VISIBLE_RESOURCE_WHERE_ALIAS,
  type ResolvedResourceScope,
  type ResourceScopeError,
} from './resourceScope';

/**
 * 校验管理员权限中间件
 *
 * 与 adminRoutes.requireAdmin 对齐：拒绝桌面占位身份（DESKTOP_OPERATOR_USER_ID），
 * 只认 JWT/DB 中的管理员角色。此前仅用 isEnterpriseAdminRole，导致桌面端
 * 占位身份可绕过 devopsRoutes 的 admin 校验。
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (
    !req.user ||
    !isWebuiBuiltinAdministrator({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      tenant_id: req.user.tenant_id,
    })
  ) {
    res.status(403).json({ success: false, message: 'Admin only' });
    return;
  }
  next();
}

/**
 * 获取当前用户的租户 ID 兜底
 */
function resolveTenantId(req: Request): string {
  return (req.user?.tenant_id ?? 'default').trim() || 'default';
}

function resolvePersonalResourceOwnerId(req: Request): string {
  return req.user?.id ?? DESKTOP_OPERATOR_USER_ID;
}

function resolvePersonalResourceOwnerName(req: Request): string {
  return resolveCreatorDisplayName(resolvePersonalResourceOwnerId(req), req.user?.username);
}

/** 列表/树接口 JOIN 出的 creator_name 与评论 author_name 统一可读展示名 */
function resolveCreatorDisplayName(creatorId: string, joinedName?: string | null): string {
  if (creatorId === DESKTOP_OPERATOR_USER_ID) {
    return '本地用户';
  }
  const trimmed = joinedName?.trim();
  if (trimmed && trimmed !== creatorId) {
    return trimmed;
  }
  return trimmed || creatorId;
}

function canUseAnonymousDesktopDevops(req: Request): boolean {
  return canUseAnonymousLocalDevops(req);
}

async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = TokenMiddleware.extractToken(req);
  if (!token) {
    if (canUseAnonymousDesktopDevops(req)) {
      next();
      return;
    }
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const decoded = await AuthService.verifyToken(token);
  if (!decoded) {
    if (canUseAnonymousDesktopDevops(req)) {
      next();
      return;
    }
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const user = await UserRepository.findById(decoded.userId);
  if (!user) {
    if (canUseAnonymousDesktopDevops(req)) {
      next();
      return;
    }
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const role = user.role === 'admin'
    ? 'system_admin'
    : user.role === 'user'
      ? 'member'
      : user.role === 'system_admin' || user.role === 'org_admin' || user.role === 'member'
        ? user.role
        : 'member';
  req.user = {
    id: user.id,
    username: user.username,
    role,
    tenant_id: (user as { tenant_id?: string | null }).tenant_id ?? 'default',
  };
  next();
}

function isScopeError(value: ResolvedResourceScope | ResourceScopeError): value is ResourceScopeError {
  return 'error' in value;
}

/**
 * SSRF guard for user-supplied fetch URLs.
 * Rejects non-http(s) protocols, private/loopback/link-local/multicast IPs,
 * and hostnames that resolve to private IPs (basic DNS-rebinding mitigation).
 */
async function assertSafeFetchUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https protocols are allowed');
  }
  const host = parsed.hostname;
  if (!host) {
    throw new Error('Invalid host');
  }
  // If host is a literal IP, check it directly; otherwise resolve DNS.
  const ipVersion = isIP(host);
  const ipsToCheck: string[] = [];
  if (ipVersion) {
    ipsToCheck.push(host);
  } else {
    try {
      const records = await lookup(host, { all: true });
      for (const r of records) {
        ipsToCheck.push(r.address);
      }
    } catch {
      throw new Error('Failed to resolve hostname');
    }
  }
  for (const ip of ipsToCheck) {
    if (isPrivateOrLoopbackIp(ip)) {
      throw new Error('Fetching private/loopback addresses is not allowed');
    }
  }
  return parsed;
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true; // any / loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

function insertRagDocumentRecord(input: {
  driver: ReturnType<Awaited<ReturnType<typeof getDatabase>>['getDriver']>;
  docId: string;
  tenantId: string;
  title: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  scope: ResolvedResourceScope['scope'];
  teamId: string | null;
  createdBy: string;
}): void {
  const now = Date.now();
  input.driver
    .prepare(
      `INSERT INTO rag_documents (
        id, tenant_id, title, file_path, file_size, mime_type,
        status, chunk_count, last_error, scope, team_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'indexing', 0, NULL, ?, ?, ?, ?, ?)`
    )
    .run(
      input.docId,
      input.tenantId,
      input.title,
      input.filePath,
      input.fileSize,
      input.mimeType,
      input.scope,
      input.teamId,
      input.createdBy,
      now,
      now
    );
}

export function registerDevOpsRoutes(app: Express): void {
  const auth = TokenMiddleware.validateToken({ responseType: 'json' });

  const ragUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

  registerCmeasRoutes(app, auth);
  registerCtestRoutes(app, auth);
  registerCflowRoutes(app, auth);
  registerCteamRoutes(app, auth);
  registerCpackRoutes(app, auth);
  registerCcodeRoutes(app, auth);
  registerCciRoutes(app, auth);

  // ==========================================
  // 0. RAG 文件上传 & URL 导入
  // ==========================================

  // GET /api/admin/rag/status — 检查 embedding 模型是否就绪
  app.get('/api/admin/rag/status', apiRateLimiter, auth, async (_req, res) => {
    try {
      await RAGService.checkHealth();
      res.json({ success: true, data: { ready: true, message: 'Embedding model loaded' } });
    } catch (error) {
      res.json({
        success: true,
        data: {
          ready: false,
          message: error instanceof Error ? error.message : 'Embedding model not ready',
        },
      });
    }
  });

  // POST /api/admin/rag/upload — 上传本地文件 (无需 CSRF，multipart)
  app.post('/api/admin/rag/upload', ragUpload.single('file'), auth, async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const ext = path.extname(file.originalname || '').toLowerCase();
      let content = '';

      if (['.md', '.txt', '.ts', '.tsx', '.js', '.json', '.css'].includes(ext)) {
        content = file.buffer.toString('utf-8');
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        content = result.value;
      } else if (ext === '.html' || ext === '.htm') {
        content = extractHtmlText(file.buffer.toString('utf-8'));
      } else {
        res.status(400).json({ success: false, message: `Unsupported: ${ext}. Supported: md, txt, docx, html, ts, json` });
        return;
      }

      if (!content.trim()) {
        res.status(400).json({ success: false, message: 'Empty content' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const docId = randomUUID();
      const resolvedScope = resolveResourceScope(req, driver, tenantId, {
        scope: req.body?.scope,
        team_id: req.body?.team_id,
      });
      if (isScopeError(resolvedScope)) {
        res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
        return;
      }
      insertRagDocumentRecord({
        driver,
        docId,
        tenantId,
        title: file.originalname,
        filePath: `memory://${file.originalname}`,
        fileSize: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        scope: resolvedScope.scope,
        teamId: resolvedScope.teamId,
        createdBy: userId,
      });
      queueRagDocumentIndexing({ driver, docId, title: file.originalname, content });

      res.json({ success: true, data: { id: docId, status: 'indexing', title: file.originalname, size: file.size } });
    } catch (err) {
      console.error('[DevOpsRoute] rag upload error:', err);
      res.status(500).json({ success: false, message: getRagErrorMessage(err) });
    }
  });

  // POST /api/admin/rag/import-url — 导入普通在线网页内容
  app.post('/api/admin/rag/import-url', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const { url, title } = req.body;
      if (!url?.trim()) {
        res.status(400).json({ success: false, message: 'URL required' });
        return;
      }

      let content = '';
      try {
        const safeUrl = await assertSafeFetchUrl(url.trim());
        const fetchRes = await fetch(safeUrl, { headers: { 'User-Agent': '1ONE-RAG/1.0' } });
        if (!fetchRes.ok) {
          res.status(400).json({ success: false, message: `HTTP ${fetchRes.status}` });
          return;
        }
        content = extractHtmlText(await fetchRes.text());
      } catch (error) {
        console.error('[DevOpsRoute] import RAG URL fetch error:', error);
        res.status(400).json({ success: false, message: getRagErrorMessage(error) });
        return;
      }

      if (!content) {
        res.status(400).json({ success: false, message: 'No content' });
        return;
      }

      const docTitle = title?.trim() || new URL(url).pathname.split('/').pop() || url;
      const db = await getDatabase();
      const driver = db.getDriver();
      const docId = randomUUID();
      const resolvedScope = resolveResourceScope(req, driver, tenantId, {
        scope: req.body?.scope,
        team_id: req.body?.team_id,
      });
      if (isScopeError(resolvedScope)) {
        res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
        return;
      }
      insertRagDocumentRecord({
        driver,
        docId,
        tenantId,
        title: docTitle,
        filePath: url.trim(),
        fileSize: Buffer.byteLength(content),
        mimeType: 'text/html',
        scope: resolvedScope.scope,
        teamId: resolvedScope.teamId,
        createdBy: userId,
      });
      queueRagDocumentIndexing({ driver, docId, title: docTitle, content });

      res.json({ success: true, data: { id: docId, status: 'indexing', title: docTitle } });
    } catch (err) {
      console.error('[DevOpsRoute] import RAG URL error:', err);
      res.status(500).json({ success: false, message: getRagErrorMessage(err) });
    }
  });

  // POST /api/admin/rag/import-feishu — 使用企业飞书配置导入 docx/wiki 文档
  app.post('/api/admin/rag/import-feishu', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const { url, title } = req.body;

      if (!url?.trim()) {
        res.status(400).json({ success: false, message: 'URL required' });
        return;
      }

      const provider = await AuthProviderRepository.getProvider('feishu');
      const appId = String(provider?.config?.appId ?? '').trim();
      const appSecret = String(provider?.config?.appSecret ?? '').trim();
      if (!provider?.enabled || !appId || !appSecret) {
        res.status(400).json({ success: false, message: 'Feishu provider is not configured' });
        return;
      }

      const imported = await fetchFeishuDocumentContentFromUrl({
        url: url.trim(),
        config: {
          appId,
          appSecret,
        },
      });
      const docTitle = title?.trim() || imported.title;

      const db = await getDatabase();
      const driver = db.getDriver();
      const docId = randomUUID();
      const resolvedScope = resolveResourceScope(req, driver, tenantId, {
        scope: req.body?.scope,
        team_id: req.body?.team_id,
      });
      if (isScopeError(resolvedScope)) {
        res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
        return;
      }
      insertRagDocumentRecord({
        driver,
        docId,
        tenantId,
        title: docTitle,
        filePath: url.trim(),
        fileSize: Buffer.byteLength(imported.content),
        mimeType: imported.mimeType,
        scope: resolvedScope.scope,
        teamId: resolvedScope.teamId,
        createdBy: userId,
      });
      queueRagDocumentIndexing({ driver, docId, title: docTitle, content: imported.content });

      res.json({ success: true, data: { id: docId, status: 'indexing', title: docTitle } });
    } catch (error) {
      console.error('[DevOpsRoute] import RAG Feishu document error:', error);
      res.status(400).json({ success: false, message: getRagErrorMessage(error) });
    }
  });

  // GET /api/admin/requirements/tree — 以树形层级列出所有需求
  app.get('/api/admin/requirements/tree', apiRateLimiter, optionalAuth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const db = await getDatabase();
      const driver = db.getDriver();

      // 查询所有需求记录
      const rows = driver
        .prepare(
          `SELECT r.id, r.tenant_id, r.parent_id, r.type, r.subject, r.description, r.status, r.priority,
                  r.assigned_to, r.milestone_id, r.creator_id, r.created_at, r.updated_at,
                  COALESCE(u.username, r.creator_id) AS creator_name
           FROM requirements r
           LEFT JOIN users u ON u.id = r.creator_id
           WHERE r.tenant_id = ?
           ORDER BY r.created_at ASC`
        )
        .all(tenantId) as any[];

      // 在内存中构建多级层级树
      const itemMap = new Map<string, any>();
      const rootItems: any[] = [];

      for (const row of rows) {
        itemMap.set(row.id, {
          ...row,
          creator_name: resolveCreatorDisplayName(row.creator_id, row.creator_name),
          children: [],
        });
      }

      for (const item of itemMap.values()) {
        if (item.parent_id && itemMap.has(item.parent_id)) {
          itemMap.get(item.parent_id).children.push(item);
        } else {
          rootItems.push(item);
        }
      }

      res.json({ success: true, data: rootItems });
    } catch (err) {
      console.error('[DevOpsRoute] list requirements tree error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/requirements — 创建需求卡片
  app.post('/api/admin/requirements', apiRateLimiter, optionalAuth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const { parent_id, type, subject, description, status, priority, assigned_to, milestone_id } = req.body;

      if (!subject?.trim()) {
        res.status(400).json({ success: false, message: 'Subject is required' });
        return;
      }

      const allowedTypes = ['epic', 'feature', 'story', 'bug', 'task'];
      if (!allowedTypes.includes(type)) {
        res.status(400).json({ success: false, message: 'Invalid requirement type' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const id = randomUUID();
      const now = Date.now();

      if (type === 'epic' && milestone_id) {
        const milestone = driver
          .prepare(`SELECT id FROM milestones WHERE id = ? AND tenant_id = ?`)
          .get(String(milestone_id), tenantId);
        if (!milestone) {
          res.status(400).json({ success: false, message: 'Milestone not found' });
          return;
        }
      }

      driver
        .prepare(
          `INSERT INTO requirements (id, tenant_id, parent_id, type, subject, description, status, priority, assigned_to, milestone_id, creator_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          tenantId,
          parent_id || null,
          type,
          subject.trim(),
          description || null,
          status || 'backlog',
          priority || 'medium',
          assigned_to || null,
          type === 'epic' && milestone_id ? String(milestone_id) : null,
          resolvePersonalResourceOwnerId(req),
          now,
          now
        );

      res.json({ success: true, data: { id } });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.requirementCreate, `requirement:${id}:${type}`);
    } catch (err) {
      console.error('[DevOpsRoute] create requirement error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/requirements/:id — 更新需求状态、优先级、指派人
  app.patch('/api/admin/requirements/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);
      const updates = req.body;

      const db = await getDatabase();
      const driver = db.getDriver();

      const existing = driver
        .prepare(`SELECT type, status, creator_id FROM requirements WHERE id = ? AND tenant_id = ?`)
        .get(id, tenantId) as { type: string; status: string; creator_id: string | null } | undefined;

      if (!existing) {
        res.status(404).json({ success: false, message: 'Requirement not found' });
        return;
      }

      // Ownership: enterprise admins can edit any card; members only their own.
      const currentUserId = resolvePersonalResourceOwnerId(req);
      const isMemberOnly = !isEnterpriseAdminRole(req.user?.role);
      if (isMemberOnly && existing.creator_id && existing.creator_id !== currentUserId) {
        res.status(403).json({ success: false, message: 'You can only edit requirements you created' });
        return;
      }

      // 状态机校验：拒绝非法跳转（如 backlog 直接跳 completed、completed 回退）
      // Legal transitions: backlog -> planning -> developing -> testing -> completed
      // 允许任意状态回退到 backlog（重新规划），允许同状态（幂等）
      if (updates.status !== undefined && updates.status !== existing.status) {
        const LEGAL_NEXT: Record<string, ReadonlyArray<string>> = {
          backlog: ['planning'],
          planning: ['developing', 'backlog'],
          developing: ['testing', 'backlog'],
          testing: ['completed', 'backlog'],
          completed: ['backlog'],
        };
        const allowed = LEGAL_NEXT[existing.status] ?? [];
        if (!allowed.includes(updates.status)) {
          res.status(400).json({
            success: false,
            message: `Illegal status transition: ${existing.status} -> ${updates.status}`,
          });
          return;
        }
      }

      const fieldsToUpdate: string[] = [];
      const values: any[] = [];

      const allowedFields = ['subject', 'description', 'status', 'priority', 'assigned_to', 'milestone_id'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'milestone_id') {
            if (existing.type !== 'epic') {
              res.status(400).json({ success: false, message: 'Only epics can bind to milestones' });
              return;
            }
            const nextMilestoneId = updates[field] ? String(updates[field]) : null;
            if (nextMilestoneId) {
              const milestone = driver
                .prepare(`SELECT id FROM milestones WHERE id = ? AND tenant_id = ?`)
                .get(nextMilestoneId, tenantId);
              if (!milestone) {
                res.status(400).json({ success: false, message: 'Milestone not found' });
                return;
              }
            }
          }
          fieldsToUpdate.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (fieldsToUpdate.length === 0) {
        res.status(400).json({ success: false, message: 'No fields to update' });
        return;
      }

      fieldsToUpdate.push('updated_at = ?');
      values.push(Date.now());

      // 条件
      values.push(id);
      values.push(tenantId);

      driver
        .prepare(
          `UPDATE requirements SET ${fieldsToUpdate.join(', ')} WHERE id = ? AND tenant_id = ?`
        )
        .run(...values);

      // CFlow 自动打点：当需求状态发生流转时，写入价值流阶段记录
      if (updates.status) {
        const stageMap: Record<string, string> = {
          backlog: '需求分析',
          planning: '设计规划',
          developing: '开发编码',
          testing: '测试验证',
          completed: '部署发布',
        };
        const stageName = stageMap[updates.status];
        if (stageName) {
          const nowFl = Date.now();
          try {
            const openStage = driver
              .prepare(
                `SELECT id, entry_time FROM value_stream_stages
                 WHERE requirement_id = ? AND exit_time IS NULL
                 ORDER BY entry_time DESC LIMIT 1`
              )
              .get(id) as { id: string; entry_time: number } | undefined;

            if (openStage) {
              const processMs = Math.max(0, nowFl - openStage.entry_time);
              driver
                .prepare(
                  `UPDATE value_stream_stages SET exit_time = ?, process_duration_ms = ? WHERE id = ?`
                )
                .run(nowFl, processMs, openStage.id);
            }

            driver
              .prepare(
                `INSERT INTO value_stream_stages
                 (id, tenant_id, requirement_id, stage_name, entry_time, exit_time, wait_duration_ms, process_duration_ms)
                 VALUES (?,?,?,?,?,?,?,?)`
              )
              .run(randomUUID(), tenantId, id, stageName, nowFl, null, 0, 0);
          } catch { /* ignore flow logging errors */ }
        }
      }

      res.json({ success: true });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.requirementUpdate, `requirement:${id}`);
    } catch (err) {
      console.error('[DevOpsRoute] update requirement error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/requirements/:id — 删除卡片（级联删除所有子卡片）
  app.delete('/api/admin/requirements/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);

      const db = await getDatabase();
      const driver = db.getDriver();

      const existing = driver
        .prepare(`SELECT creator_id FROM requirements WHERE id = ? AND tenant_id = ?`)
        .get(id, tenantId) as { creator_id: string | null } | undefined;

      if (!existing) {
        res.status(404).json({ success: false, message: 'Requirement not found' });
        return;
      }

      // Ownership: enterprise admins can delete any card; members only their own.
      const currentUserId = resolvePersonalResourceOwnerId(req);
      const isMemberOnly = !isEnterpriseAdminRole(req.user?.role);
      if (isMemberOnly && existing.creator_id && existing.creator_id !== currentUserId) {
        res.status(403).json({ success: false, message: 'You can only delete requirements you created' });
        return;
      }

      const result = driver
        .prepare(`DELETE FROM requirements WHERE id = ? AND tenant_id = ?`)
        .run(id, tenantId);

      if (result.changes === 0) {
        res.status(404).json({ success: false, message: 'Requirement not found' });
        return;
      }

      res.json({ success: true });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.requirementDelete, `requirement:${id}`);
    } catch (err) {
      console.error('[DevOpsRoute] delete requirement error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/requirements/:id/comments — 用户 / Agent 发表评论
  app.post('/api/admin/requirements/:id/comments', apiRateLimiter, optionalAuth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const requirementId = String(req.params.id);
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      if (!body) {
        res.status(400).json({ success: false, message: 'Comment body is required' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const requirement = driver
        .prepare(`SELECT id FROM requirements WHERE id = ? AND tenant_id = ?`)
        .get(requirementId, tenantId);
      if (!requirement) {
        res.status(404).json({ success: false, message: 'Requirement not found' });
        return;
      }

      const { insertRequirementComment } = await import('@process/services/devops/requirementCommentService');
      const commentId = await insertRequirementComment({
        tenantId,
        requirementId,
        authorType: 'user',
        authorId: resolvePersonalResourceOwnerId(req),
        authorName: resolvePersonalResourceOwnerName(req),
        body,
      });

      res.json({ success: true, data: { id: commentId } });
    } catch (err) {
      console.error('[DevOpsRoute] create requirement comment error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/requirements/:id/comments — Issue 评论（含 Autopilot 回写）
  app.get('/api/admin/requirements/:id/comments', apiRateLimiter, optionalAuth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const requirementId = String(req.params.id);
      const db = await getDatabase();
      const driver = db.getDriver();

      const requirement = driver
        .prepare(`SELECT id FROM requirements WHERE id = ? AND tenant_id = ?`)
        .get(requirementId, tenantId);
      if (!requirement) {
        res.status(404).json({ success: false, message: 'Requirement not found' });
        return;
      }

      const rows = driver
        .prepare(
          `SELECT id, tenant_id, requirement_id, author_type, author_id, author_name, body, metadata, created_at
           FROM requirement_comments
           WHERE requirement_id = ? AND tenant_id = ?
           ORDER BY created_at DESC
           LIMIT 50`
        )
        .all(requirementId, tenantId) as Array<{
          id: string;
          tenant_id: string;
          requirement_id: string;
          author_type: string;
          author_id: string | null;
          author_name: string;
          body: string;
          metadata: string | null;
          created_at: number;
        }>;

      res.json(
        rows.map((row) => ({
          ...row,
          author_name:
            row.author_id != null
              ? resolveCreatorDisplayName(row.author_id, row.author_name)
              : row.author_name,
          author_type: row.author_type as 'user' | 'agent' | 'autopilot',
          metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
        }))
      );
    } catch (err) {
      console.error('[DevOpsRoute] list requirement comments error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ==========================================
  // 2. RAG 知识库核心 API
  // ==========================================

  // GET /api/admin/rag/documents — 列出当前企业所有文档元数据（按权限 scope 过滤）
  app.get('/api/admin/rag/documents', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const db = await getDatabase();
      const driver = db.getDriver();

      // 管理员看全部，普通用户看组织共享 + 个人 + 所属团队
      const rows = isAdmin
        ? driver.prepare(`SELECT id, tenant_id, title, file_path, file_size, mime_type, status, chunk_count, last_error, scope, team_id, created_by, created_at, updated_at FROM rag_documents WHERE tenant_id = ? ORDER BY created_at DESC`).all(tenantId)
        : driver.prepare(`SELECT id, tenant_id, title, file_path, file_size, mime_type, status, chunk_count, last_error, scope, team_id, created_by, created_at, updated_at FROM rag_documents WHERE tenant_id = ? AND ${VISIBLE_RESOURCE_WHERE} ORDER BY created_at DESC`).all(tenantId, userId, tenantId, userId);

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[DevOpsRoute] list RAG documents error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/rag/documents — 提交文本知识（记录 scope 和 creator）
  app.post('/api/admin/rag/documents', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const { title, content, scope, team_id } = req.body;

      if (!title?.trim() || !content?.trim()) {
        res.status(400).json({ success: false, message: 'Title and content are required' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const resolvedScope = resolveResourceScope(req, driver, tenantId, { scope, team_id });
      if (isScopeError(resolvedScope)) {
        res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
        return;
      }

      const docId = randomUUID();

      insertRagDocumentRecord({
        driver,
        docId,
        tenantId,
        title: title.trim(),
        filePath: 'memory://text',
        fileSize: Buffer.byteLength(content),
        mimeType: 'text/plain',
        scope: resolvedScope.scope,
        teamId: resolvedScope.teamId,
        createdBy: userId,
      });
      queueRagDocumentIndexing({ driver, docId, title: title.trim(), content });

      res.json({ success: true, data: { id: docId, status: 'indexing' } });
    } catch (err) {
      console.error('[DevOpsRoute] upload document error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/rag/documents/:id — 更新文档可见范围（管理员或资源管理者）
  app.patch('/api/admin/rag/documents/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);
      const { scope, team_id } = req.body;

      const db = await getDatabase();
      const driver = db.getDriver();
      const resource = getScopedResourceOrNull(driver, tenantId, 'rag_documents', id);
      if (!resource || !canManageScopedResource(req, driver, tenantId, resource)) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }

      const resolvedScope = resolveResourceScope(req, driver, tenantId, { scope, team_id });
      if (isScopeError(resolvedScope)) {
        res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
        return;
      }

      driver
        .prepare(`UPDATE rag_documents SET scope = ?, team_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
        .run(resolvedScope.scope, resolvedScope.teamId, Date.now(), id, tenantId);

      res.json({ success: true });
    } catch (err) {
      console.error('[DevOpsRoute] update RAG document scope error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/rag/query — 相似度语义检索测试（Top-K 余弦比对）
  app.post('/api/admin/rag/query', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const query = String(req.body?.query ?? '').trim();
      const limit = Math.min(Math.max(Number(req.body?.limit) || 5, 1), 20);

      if (!query) {
        res.json({ success: true, data: [] });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();

      // 1. 将查询文本实时转化为向量 (384 维)
      const queryVector = await RAGService.getEmbedding(query);

      // 2. 从数据库加载当前用户可见的 Chunks
      const rows = (isAdmin
        ? driver
          .prepare(
            `SELECT c.content, c.chunk_index, c.embedding, d.title
             FROM rag_document_chunks c
             JOIN rag_documents d ON d.id = c.document_id
             WHERE d.tenant_id = ?`
          )
          .all(tenantId)
        : driver
          .prepare(
            `SELECT c.content, c.chunk_index, c.embedding, d.title
             FROM rag_document_chunks c
             JOIN rag_documents d ON d.id = c.document_id
             WHERE d.tenant_id = ? AND ${VISIBLE_RESOURCE_WHERE_ALIAS('d')}`
          )
          .all(tenantId, userId, tenantId, userId)) as any[];

      // 3. 在内存中极速计算余弦相似度并排序
      const scoredResults = rows
        .map((row) => {
          const chunkVector = RAGService.bufferToVector(row.embedding);
          const score = RAGService.cosineSimilarity(queryVector, chunkVector);
          return {
            title: row.title,
            chunk_index: row.chunk_index,
            content: row.content,
            score,
          };
        })
        .filter((r) => r.score >= 0.3) // 过滤掉相关性极低的数据（余弦相似度阈值过滤）
        .toSorted((a, b) => b.score - a.score) // 相关性从高到低排序
        .slice(0, limit);

      res.json({ success: true, data: scoredResults });
    } catch (err) {
      console.error('[DevOpsRoute] rag search error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/rag/documents/:id — 删除知识库文档（拥有者或管理员可删除）
  app.delete('/api/admin/rag/documents/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);

      const db = await getDatabase();
      const driver = db.getDriver();

      const resource = getScopedResourceOrNull(driver, tenantId, 'rag_documents', id);
      if (!resource || !canManageScopedResource(req, driver, tenantId, resource)) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }

      const result = driver
        .prepare(`DELETE FROM rag_documents WHERE id = ? AND tenant_id = ?`)
        .run(id, tenantId);

      if (result.changes === 0) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }

      res.json({ success: true });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.ragDocumentDelete, `rag_document:${id}`);
    } catch (err) {
      console.error('[DevOpsRoute] delete RAG document error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ==========================================
  // 3. MCP 统一工具箱：连接器 API
  // ==========================================

  // GET /api/admin/mcp/registry — 列出所有的工具服务（按权限 scope 过滤）
  app.get('/api/admin/mcp/registry', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const db = await getDatabase();
      const driver = db.getDriver();

      const rows = (isAdmin
        ? driver.prepare(`SELECT id, tenant_id, name, type, endpoint, env_json, enabled, scope, team_id, created_by, created_at, updated_at FROM mcp_registry WHERE tenant_id = ? ORDER BY name ASC`).all(tenantId)
        : driver.prepare(`SELECT id, tenant_id, name, type, endpoint, env_json, enabled, scope, team_id, created_by, created_at, updated_at FROM mcp_registry WHERE tenant_id = ? AND ${VISIBLE_RESOURCE_WHERE} ORDER BY name ASC`).all(tenantId, userId, tenantId, userId)) as any[];

      // 为了安全，不返回具体的 env_json 明文，仅以布尔标记其是否配置过
      const safeRows = rows.map((row) => {
        let hasKeys = false;
        try {
          if (row.env_json) {
            const parsed = JSON.parse(row.env_json);
            hasKeys = Object.keys(parsed).length > 0;
          }
        } catch { /* ignore */ }

        return {
          id: row.id,
          tenant_id: row.tenant_id,
          name: row.name,
          type: row.type,
          endpoint: row.endpoint,
          enabled: row.enabled === 1,
          scope: row.scope,
          team_id: row.team_id,
          created_by: row.created_by,
          hasKeys,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });

      res.json({ success: true, data: safeRows });
    } catch (err) {
      console.error('[DevOpsRoute] list MCP servers error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/mcp/registry — 注册或编辑外部 MCP 节点
  app.post('/api/admin/mcp/registry', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const { id, name, type, endpoint, env, enabled, scope, team_id } = req.body;

      if (!name?.trim() || !endpoint?.trim() || !type) {
        res.status(400).json({ success: false, message: 'name, type and endpoint are required' });
        return;
      }

      if (!['sse', 'stdio'].includes(type)) {
        res.status(400).json({ success: false, message: 'Invalid MCP type' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const now = Date.now();

      const envJsonStr = env && typeof env === 'object' ? JSON.stringify(env) : '{}';

      if (id) {
        // 编辑模式
        const existing = getScopedResourceOrNull(driver, tenantId, 'mcp_registry', id);
        if (!existing || !canManageScopedResource(req, driver, tenantId, existing)) {
          res.status(404).json({ success: false, message: 'MCP registry not found' });
          return;
        }

        const resolvedScope = resolveResourceScope(req, driver, tenantId, { scope, team_id });
        if (isScopeError(resolvedScope)) {
          res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
          return;
        }

        // 保存时如果合并，我们做增量合并
        const oldRow = driver
          .prepare(`SELECT env_json FROM mcp_registry WHERE id = ?`)
          .get(id) as { env_json: string } | undefined;
        let finalEnv = envJsonStr;
        try {
          if (oldRow?.env_json) {
            const oldEnv = JSON.parse(oldRow.env_json);
            const newEnv = JSON.parse(envJsonStr);
            // 客户端如果对已存在 Key 发送 '******' 占位，则保留老密码
            for (const [k, v] of Object.entries(newEnv)) {
              if (v === '******' && oldEnv[k]) {
                newEnv[k] = oldEnv[k];
              }
            }
            finalEnv = JSON.stringify(newEnv);
          }
        } catch { /* ignore */ }

        driver
          .prepare(
            `UPDATE mcp_registry
             SET name = ?, type = ?, endpoint = ?, env_json = ?, enabled = ?, scope = ?, team_id = ?, updated_at = ?
             WHERE id = ? AND tenant_id = ?`
          )
          .run(name.trim(), type, endpoint.trim(), finalEnv, enabled ? 1 : 0, resolvedScope.scope, resolvedScope.teamId, now, id, tenantId);
      } else {
        // 新建模式
        const resolvedScope = resolveResourceScope(req, driver, tenantId, { scope, team_id });
        if (isScopeError(resolvedScope)) {
          res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
          return;
        }
        const nextId = randomUUID();
        driver
          .prepare(
            `INSERT INTO mcp_registry (id, tenant_id, name, type, endpoint, env_json, enabled, scope, team_id, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(nextId, tenantId, name.trim(), type, endpoint.trim(), envJsonStr, enabled ? 1 : 0, resolvedScope.scope, resolvedScope.teamId, userId, now, now);
      }

      res.json({ success: true });
      const mcpAction = id ? DEVOPS_AUDIT_ACTIONS.mcpUpdate : DEVOPS_AUDIT_ACTIONS.mcpCreate;
      void recordDevopsAudit(req, mcpAction, `mcp:${id ?? ''}:${name.trim()}`);
    } catch (err) {
      console.error('[DevOpsRoute] set MCP server error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/mcp/registry/:id — 注销 MCP 连接
  app.delete('/api/admin/mcp/registry/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);

      const db = await getDatabase();
      const driver = db.getDriver();

      const resource = getScopedResourceOrNull(driver, tenantId, 'mcp_registry', id);
      if (!resource || !canManageScopedResource(req, driver, tenantId, resource)) {
        res.status(404).json({ success: false, message: 'MCP not found' });
        return;
      }

      const result = driver
        .prepare(`DELETE FROM mcp_registry WHERE id = ? AND tenant_id = ?`)
        .run(id, tenantId);

      if (result.changes === 0) {
        res.status(404).json({ success: false, message: 'MCP not found' });
        return;
      }

      res.json({ success: true });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.mcpDelete, `mcp:${id}`);
    } catch (err) {
      console.error('[DevOpsRoute] delete MCP error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/mcp/registry/:id/toggle — 仅切换 enabled，不触碰 env_json
  // 专用端点，避免 saveMcpRegistry 路径的 env 合并逻辑误清凭证
  app.patch('/api/admin/mcp/registry/:id/toggle', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);
      const enabled = req.body?.enabled === true;

      const db = await getDatabase();
      const driver = db.getDriver();

      const resource = getScopedResourceOrNull(driver, tenantId, 'mcp_registry', id);
      if (!resource || !canManageScopedResource(req, driver, tenantId, resource)) {
        res.status(404).json({ success: false, message: 'MCP not found' });
        return;
      }

      driver
        .prepare(`UPDATE mcp_registry SET enabled = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
        .run(enabled ? 1 : 0, Date.now(), id, tenantId);

      res.json({ success: true });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.mcpToggle, `mcp:${id}:enabled=${enabled}`);
    } catch (err) {
      console.error('[DevOpsRoute] toggle MCP error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ==========================================
  // 9. 安全审计日志 API
  // ==========================================

  app.get('/api/admin/audit-logs', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const db = await getDatabase();
      const driver = db.getDriver();
      const rows = (isAdmin
        ? driver.prepare(`SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200`).all(tenantId)
        : (() => {
          const peerIds = getTeamPeerUserIds(driver, tenantId, userId);
          const placeholders = peerIds.map(() => '?').join(',');
          return driver
            .prepare(`SELECT * FROM audit_logs WHERE tenant_id = ? AND user_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 200`)
            .all(tenantId, ...peerIds);
        })()) as any[];
      res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: 'Internal server error' }); }
  });


  // ==========================================
  // 10. 批量导入 API (Skills / MCP / RAG)
  // ==========================================

  app.post('/api/admin/skills/batch', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req); const userId = req.user!.id; const items = req.body?.items;
      if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ success: false, message: 'items array required' }); return; }
      const db = await getDatabase(); const driver = db.getDriver(); const now = Date.now();
      const stmt = driver.prepare(`INSERT OR IGNORE INTO skills_registry (id, tenant_id, name, description, content, enabled, scope, created_by, created_at, updated_at) VALUES (?,?,?,?,?,1,'personal',?,?,?)`);
      let count = 0;
      driver.transaction(() => {
        for (const item of items) {
          if (!item.name?.trim()) {
            continue;
          }
          const result = stmt.run(
            randomUUID(),
            tenantId,
            item.name.trim(),
            item.description || '',
            item.content || '',
            userId,
            now,
            now
          ) as { changes?: number };
          if ((result.changes ?? 0) > 0) {
            count++;
          }
        }
      })();
      res.json({ success: true, data: { count } });
    } catch (err) { res.status(500).json({ success: false, message: 'Internal server error' }); }
  });

  app.post('/api/admin/mcp/batch', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req); const userId = req.user!.id; const items = req.body?.items;
      if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ success: false, message: 'items array required' }); return; }
      const db = await getDatabase(); const driver = db.getDriver(); const now = Date.now();
      const stmt = driver.prepare(`INSERT OR IGNORE INTO mcp_registry (id, tenant_id, name, type, endpoint, env_json, enabled, scope, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,1,'personal',?,?,?)`);
      let count = 0;
      driver.transaction(() => {
        for (const item of items) {
          if (item.name?.trim()) {
            const itemType = ['sse', 'stdio'].includes(item.type) ? item.type : 'sse';
            stmt.run(randomUUID(), tenantId, item.name.trim(), itemType, item.endpoint || '', item.env_json || '{}', userId, now, now);
            count++;
          }
        }
      })();
      res.json({ success: true, data: { count } });
    } catch (err) { res.status(500).json({ success: false, message: 'Internal server error' }); }
  });

  // ==========================================
  // 3.5 企业 Skills 技能仓库 API
  // ==========================================

  // GET /api/admin/skills — 列出技能（按权限 scope 过滤）
  app.get('/api/admin/skills', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const db = await getDatabase();
      const driver = db.getDriver();
      const rows = (isAdmin
        ? driver.prepare(`SELECT id, tenant_id, name, description, content, enabled, scope, team_id, created_by, created_at, updated_at FROM skills_registry WHERE tenant_id = ? ORDER BY name ASC`).all(tenantId)
        : driver.prepare(`SELECT id, tenant_id, name, description, content, enabled, scope, team_id, created_by, created_at, updated_at FROM skills_registry WHERE tenant_id = ? AND ${VISIBLE_RESOURCE_WHERE} ORDER BY name ASC`).all(tenantId, userId, tenantId, userId)) as any[];
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[DevOpsRoute] list skills error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/skills — 创建/编辑技能
  app.post('/api/admin/skills', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const { id, name, description, content, enabled, scope, team_id } = req.body;
      if (!name?.trim()) { res.status(400).json({ success: false, message: 'name required' }); return; }
      const db = await getDatabase();
      const driver = db.getDriver();
      const now = Date.now();
      if (id) {
        const existing = getScopedResourceOrNull(driver, tenantId, 'skills_registry', id);
        if (!existing) {
          res.status(404).json({ success: false, message: 'Skill not found' });
          return;
        }
        if (!canManageScopedResource(req, driver, tenantId, existing)) {
          res.status(403).json({ success: false, message: 'Forbidden' });
          return;
        }
        const resolvedScope = resolveResourceScope(req, driver, tenantId, { scope: scope ?? existing.scope, team_id: team_id ?? existing.team_id });
        if (isScopeError(resolvedScope)) {
          res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
          return;
        }
        driver.prepare(`UPDATE skills_registry SET name=?, description=?, content=?, enabled=?, scope=?, team_id=?, updated_at=? WHERE id=? AND tenant_id=?`)
          .run(name.trim(), description||'', content||'', enabled?1:0, resolvedScope.scope, resolvedScope.teamId, now, id, tenantId);
      } else {
        const resolvedScope = resolveResourceScope(req, driver, tenantId, { scope, team_id });
        if (isScopeError(resolvedScope)) {
          res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
          return;
        }
        const nextId = randomUUID();
        driver.prepare(`INSERT INTO skills_registry (id, tenant_id, name, description, content, enabled, scope, team_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .run(nextId, tenantId, name.trim(), description||'', content||'', enabled?1:0, resolvedScope.scope, resolvedScope.teamId, userId, now, now);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[DevOpsRoute] set skill error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/skills/:id — 删除技能
  app.delete('/api/admin/skills/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const id = String(req.params.id);
      const db = await getDatabase();
      const driver = db.getDriver();
      const resource = getScopedResourceOrNull(driver, tenantId, 'skills_registry', id);
      if (!resource) {
        res.status(404).json({ success: false, message: 'Skill not found' });
        return;
      }
      if (!canManageScopedResource(req, driver, tenantId, resource)) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
      const result = driver.prepare(`DELETE FROM skills_registry WHERE id=? AND tenant_id=?`).run(id, tenantId) as {
        changes?: number;
      };
      if ((result.changes ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Skill not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[DevOpsRoute] delete skill error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

}
