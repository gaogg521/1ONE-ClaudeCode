/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { UserRepository } from '../auth/repository/UserRepository';
import { AuthService } from '../auth/service/AuthService';
import { WebuiService } from '@process/bridge/services/WebuiService';
import { AuthProviderRepository } from '../auth/repository/AuthProviderRepository';
import { AuthIdentityRepository } from '../auth/repository/AuthIdentityRepository';
import { TokenMiddleware } from '../auth/middleware/TokenMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { getDatabase } from '@process/services/database';
import {
  formatLdapConnectionError,
  testLdapConnection,
  type LdapProviderConfig,
} from '../auth/providers/LdapAuthProvider';
import { resolveLocalUserForLdapEntry, searchLdapDirectoryForAdmin } from '../auth/ldapDirectorySearch';
import { testFeishuAppCredentials } from '../auth/providers/FeishuAuthProvider';
import nodemailer from 'nodemailer';
import { resolvedSmtpFromConfig } from '../auth/smtpConfig';
import { isEnterpriseAdminRole, isSystemAdminRole, isWebuiBuiltinAdministrator } from '../auth/enterpriseRoles';
import { DEFAULT_TENANT_ID, isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import { getTeamPeerUserIds } from './resourceScope';
import { aggregateAgentTokenUsageForTenant } from '@process/services/usage/agentTokenUsage';
import {
  EnterpriseJoinError,
  clearEnterpriseExitPassword,
  createEnterpriseInvite,
  createEnterpriseTenant,
  getEnterpriseMemberCount,
  getEnterpriseExitPasswordStatus,
  listEnterpriseInvites,
  revokeEnterpriseInvite,
  setEnterpriseExitPassword,
} from '../auth/enterpriseJoinService';
import {
  assertEnterpriseSsoEnableAllowed,
  isEnterpriseSsoProvider,
} from '../auth/enterpriseSsoPolicy';
import { isElectronDesktopRequest } from '../auth/browserSessionBridge';
import { publishLoginChannelsChanged, publishOrgConfigChanged } from '../orgConfigBroadcast';
import { testDingTalkAppCredentials } from '../auth/providers/DingTalkAuthProvider';
import { testWeComAppCredentials } from '../auth/providers/WeComAuthProvider';
import { getOrgEditionSettings, setOrgEditionSettings } from '../auth/orgEditionSettings';
import { GOVERNANCE_AUDIT_ACTIONS, recordGovernanceAudit } from '../auth/auditLogService';
import {
  assertCanRevokeSystemAdmin,
  claimSystemAdmin,
  InstanceGovernanceError,
} from '../auth/instanceGovernance';

const PROTECTED_IDS = new Set(['system_default_user']);

/** Stored in `auth_providers` — extend when adding DingTalk/WeCom admin UI / login flows. */
const CONFIGURABLE_AUTH_PROVIDERS = ['ldap', 'feishu', 'dingtalk', 'wecom', 'smtp'] as const;
type ConfigurableAuthProvider = (typeof CONFIGURABLE_AUTH_PROVIDERS)[number];

function isConfigurableAuthProvider(p: string): p is ConfigurableAuthProvider {
  return (CONFIGURABLE_AUTH_PROVIDERS as readonly string[]).includes(p);
}

/** Keys to mask in GET and preserve on PUT when client sends "******". */
const MASK_SECRET_KEYS: Record<ConfigurableAuthProvider, string[]> = {
  ldap: ['bindPassword'],
  feishu: ['appSecret'],
  dingtalk: ['appSecret', 'clientSecret'],
  wecom: ['secret'],
  smtp: ['pass'],
};

/** admin-only 中间件（与侧栏企业入口、二次验证资格一致，含旧版 `admin` 角色） */
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

/** Enterprise console uses the signed-in user's tenant; standalone WebUI stays on `default`. */
function resolveAdminTenantId(req: Request): string {
  const tid = (req.user?.tenant_id ?? DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
  return isEnterpriseTenantId(tid) ? tid : DEFAULT_TENANT_ID;
}

function requireEnterpriseTenant(req: Request, res: Response): string | null {
  const tenantId = resolveAdminTenantId(req);
  if (!isEnterpriseTenantId(tenantId)) {
    res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
    return null;
  }
  return tenantId;
}

/** 认证配置以浏览器 WebUI 为准；桌面端仅镜像读取，禁止写入。 */
function rejectDesktopAuthConfigMutation(req: Request, res: Response, next: NextFunction): void {
  if (isElectronDesktopRequest(req)) {
    res.status(403).json({
      success: false,
      message: 'Auth configuration must be edited in browser WebUI',
      code: 'DESKTOP_AUTH_READ_ONLY',
    });
    return;
  }
  next();
}

export function registerAdminRoutes(app: Express): void {
  const auth = TokenMiddleware.validateToken({ responseType: 'json' });

  // GET /api/admin/auth/providers — 列出认证提供方（不含敏感配置）
  app.get('/api/admin/auth/providers', apiRateLimiter, auth, requireAdmin, async (_req, res) => {
    try {
      const providers = await AuthProviderRepository.listProviders();
      res.json({ success: true, data: providers });
    } catch (err) {
      console.error('[AdminRoute] listAuthProviders error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/auth/providers/:provider — 获取提供方配置（敏感字段不回传明文）
  app.get('/api/admin/auth/providers/:provider', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const provider = String(req.params.provider);
      if (!isConfigurableAuthProvider(provider)) {
        res.status(400).json({ success: false, message: 'Unsupported provider' });
        return;
      }
      const row = await AuthProviderRepository.getProvider(provider);
      if (!row) {
        res.json({ success: true, data: { provider, enabled: 0, config: {} } });
        return;
      }
      const cfg = { ...row.config } as Record<string, unknown>;
      for (const key of MASK_SECRET_KEYS[provider]) {
        if (typeof cfg[key] === 'string' && cfg[key]) {
          cfg[key] = '******';
        }
      }
      res.json({ success: true, data: { provider, enabled: row.enabled ? 1 : 0, config: cfg, updated_at: row.updated_at } });
    } catch (err) {
      console.error('[AdminRoute] getAuthProvider error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PUT /api/admin/auth/providers/:provider — 更新提供方配置
  app.put('/api/admin/auth/providers/:provider', apiRateLimiter, auth, requireAdmin, rejectDesktopAuthConfigMutation, async (req, res) => {
    try {
      const provider = String(req.params.provider);
      if (!isConfigurableAuthProvider(provider)) {
        res.status(400).json({ success: false, message: 'Unsupported provider' });
        return;
      }
      const enabled = Boolean(req.body?.enabled);
      const config = (req.body?.config && typeof req.body.config === 'object') ? (req.body.config as Record<string, unknown>) : {};
      const allowMultipleSso = Boolean(req.body?.allowMultipleSso);

      if (enabled && isEnterpriseSsoProvider(provider)) {
        const policy = await assertEnterpriseSsoEnableAllowed({
          provider,
          enabled,
          allowMultipleSso,
        });
        if (policy.ok === false) {
          res.status(409).json({
            success: false,
            code: 'SSO_PROVIDER_CONFLICT',
            message:
              '已有其他企业登录方式处于启用状态。默认建议同时仅启用一种用于登录；配置与测试不受此限制。若确需启用多种，请确认后重试。',
            data: { conflicts: policy.conflicts },
          });
          return;
        }
      }

      const existing = await AuthProviderRepository.getProvider(provider);
      const next = { ...existing?.config, ...config } as Record<string, unknown>;
      for (const key of MASK_SECRET_KEYS[provider]) {
        if (config[key] === '******') {
          next[key] = (existing?.config as Record<string, unknown>)?.[key] ?? '';
        }
      }
      await AuthProviderRepository.setProvider(provider, enabled, next);

      publishLoginChannelsChanged({
        tenantId: resolveAdminTenantId(req),
        provider,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] setAuthProvider error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/auth/providers/ldap/test — LDAP 连通性测试（合并已保存的密钥）
  app.post('/api/admin/auth/providers/ldap/test', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    const bodyConfig =
      req.body?.config && typeof req.body.config === 'object' ? (req.body.config as Record<string, unknown>) : {};
    const existing = await AuthProviderRepository.getProvider('ldap');
    const merged = { ...existing?.config, ...bodyConfig } as Record<string, unknown>;
    if (merged.bindPassword === '******') {
      merged.bindPassword = (existing?.config as { bindPassword?: string })?.bindPassword ?? '';
    }
    const ldapConfig = merged as LdapProviderConfig;
    try {
      await testLdapConnection(ldapConfig);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] ldap test error:', err);
      const message = formatLdapConnectionError(err, ldapConfig);
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/ldap/users/search — LDAP 目录搜索（添加团队成员等）
  app.post('/api/admin/ldap/users/search', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const query = String(req.body?.query ?? '').trim();
      if (!query) {
        res.json({ success: true, data: [] });
        return;
      }
      const ldapRow = await AuthProviderRepository.getProvider('ldap');
      if (!ldapRow?.enabled) {
        res.status(400).json({ success: false, message: 'LDAP is not enabled' });
        return;
      }
      const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 50);
      const data = await searchLdapDirectoryForAdmin(ldapRow.config as LdapProviderConfig, query, limit);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[AdminRoute] ldap user search error:', err);
      const message = err instanceof Error ? err.message : 'LDAP search failed';
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/ldap/users/resolve — 将 LDAP 条目解析为本地用户（不存在则创建并绑定）
  app.post('/api/admin/ldap/users/resolve', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const dn = String(req.body?.dn ?? '').trim();
      const username = String(req.body?.username ?? '').trim();
      if (!dn || !username) {
        res.status(400).json({ success: false, message: 'dn and username required' });
        return;
      }
      const ldapRow = await AuthProviderRepository.getProvider('ldap');
      if (!ldapRow?.enabled) {
        res.status(400).json({ success: false, message: 'LDAP is not enabled' });
        return;
      }
      const data = await resolveLocalUserForLdapEntry(
        { dn, username },
        { tenantId: resolveAdminTenantId(req) }
      );
      res.json({ success: true, data });
    } catch (err) {
      console.error('[AdminRoute] ldap user resolve error:', err);
      const message = err instanceof Error ? err.message : 'LDAP resolve failed';
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/auth/providers/smtp/test — SMTP 连通性 / 试发
  app.post('/api/admin/auth/providers/smtp/test', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const bodyConfig =
        req.body?.config && typeof req.body.config === 'object' ? (req.body.config as Record<string, unknown>) : {};
      const existing = await AuthProviderRepository.getProvider('smtp');
      const merged = { ...existing?.config, ...bodyConfig } as Record<string, unknown>;
      if (merged.pass === '******') {
        merged.pass = (existing?.config as { pass?: string })?.pass ?? '';
      }
      const smtp = resolvedSmtpFromConfig(merged);
      if (!smtp) {
        res.status(400).json({ success: false, message: 'SMTP host, port, user, pass, and from are required' });
        return;
      }
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transporter.verify();
      const toEmail = String(req.body?.toEmail ?? smtp.from).trim();
      if (toEmail) {
        await transporter.sendMail({
          from: smtp.from,
          to: toEmail,
          subject: '1ONE SMTP 测试邮件',
          text: '这是一封来自 1ONE 企业控制台的 SMTP 连通性测试邮件。',
        });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] smtp test error:', err);
      const message = err instanceof Error ? err.message : 'SMTP test failed';
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/auth/providers/feishu/test — 飞书 App 凭证测试
  app.post('/api/admin/auth/providers/feishu/test', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const bodyConfig =
        req.body?.config && typeof req.body.config === 'object' ? (req.body.config as Record<string, unknown>) : {};
      const existing = await AuthProviderRepository.getProvider('feishu');
      const merged = { ...existing?.config, ...bodyConfig } as Record<string, unknown>;
      if (merged.appSecret === '******') {
        merged.appSecret = (existing?.config as { appSecret?: string })?.appSecret ?? '';
      }
      const appId = typeof merged.appId === 'string' ? merged.appId : '';
      const appSecret = typeof merged.appSecret === 'string' ? merged.appSecret : '';
      await testFeishuAppCredentials(appId, appSecret);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] feishu test error:', err);
      const message = err instanceof Error ? err.message : 'Feishu test failed';
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/auth/providers/dingtalk/test — 钉钉 App 凭证测试
  app.post('/api/admin/auth/providers/dingtalk/test', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const bodyConfig =
        req.body?.config && typeof req.body.config === 'object' ? (req.body.config as Record<string, unknown>) : {};
      const existing = await AuthProviderRepository.getProvider('dingtalk');
      const merged = { ...existing?.config, ...bodyConfig } as Record<string, unknown>;
      for (const key of ['appSecret', 'clientSecret'] as const) {
        if (merged[key] === '******') {
          merged[key] = (existing?.config as Record<string, unknown>)?.[key] ?? '';
        }
      }
      const appKey = typeof merged.appKey === 'string' ? merged.appKey : '';
      const appSecret =
        (typeof merged.appSecret === 'string' ? merged.appSecret : '') ||
        (typeof merged.clientSecret === 'string' ? merged.clientSecret : '');
      await testDingTalkAppCredentials(appKey, appSecret);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] dingtalk test error:', err);
      const message = err instanceof Error ? err.message : 'DingTalk test failed';
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/auth/providers/wecom/test — 企业微信 App 凭证测试
  app.post('/api/admin/auth/providers/wecom/test', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const bodyConfig =
        req.body?.config && typeof req.body.config === 'object' ? (req.body.config as Record<string, unknown>) : {};
      const existing = await AuthProviderRepository.getProvider('wecom');
      const merged = { ...existing?.config, ...bodyConfig } as Record<string, unknown>;
      if (merged.secret === '******') {
        merged.secret = (existing?.config as { secret?: string })?.secret ?? '';
      }
      const corpId = typeof merged.corpId === 'string' ? merged.corpId : '';
      const secret = typeof merged.secret === 'string' ? merged.secret : '';
      await testWeComAppCredentials(corpId, secret);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] wecom test error:', err);
      const message = err instanceof Error ? err.message : 'WeCom test failed';
      res.status(400).json({ success: false, message });
    }
  });

  // GET /api/admin/users — 列出所有用户（admin）
  app.get('/api/admin/users', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const adminTenantId = resolveAdminTenantId(req);
      const allUsers = await UserRepository.listUsers();
      const users = isEnterpriseTenantId(adminTenantId)
        ? allUsers.filter((u) => u.tenant_id === adminTenantId)
        : allUsers;
      const identities = await AuthIdentityRepository.listForUsers(users.map((u) => u.id));
      const byUser = new Map<string, Array<{ provider: string; external_id: string }>>();
      for (const row of identities) {
        const list = byUser.get(row.user_id) ?? [];
        list.push({ provider: row.provider, external_id: row.external_id });
        byUser.set(row.user_id, list);
      }
      res.json({
        success: true,
        data: users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          created_at: u.created_at,
          last_login: u.last_login,
          identities: byUser.get(u.id) ?? [],
          protected: PROTECTED_IDS.has(u.id),
        })),
      });
    } catch (err) {
      console.error('[AdminRoute] listUsers error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/member-dashboard — 成员在线状态与任务完成情况（管理员看全租户，成员看同团队）
  app.get('/api/admin/member-dashboard', apiRateLimiter, auth, async (req, res) => {
    try {
      const adminTenantId = resolveAdminTenantId(req);
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const db = await getDatabase();
      const driver = db.getDriver();
      const allUsers = await UserRepository.listUsers();
      let users = isEnterpriseTenantId(adminTenantId)
        ? allUsers.filter((u) => u.tenant_id === adminTenantId)
        : allUsers;

      if (!isAdmin) {
        const peerIds = new Set(getTeamPeerUserIds(driver, adminTenantId, req.user!.id));
        users = users.filter((u) => peerIds.has(u.id));
      }

      const now = Date.now();
      // 在线判定改用 team_runtime_nodes.last_seen_at（心跳每 3 分钟刷新），
      // 与 TeamRuntimeRegistry.OFFLINE_AFTER_MS 对齐，而不是 last_login（仅登录瞬间写）。
      const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 心跳 5 分钟内视为在线
      const userIds = users.map((u) => u.id);

      // 查询每个用户最新的运行时心跳
      const heartbeatRows = userIds.length > 0
        ? (driver.prepare(
            `SELECT user_id, MAX(last_seen_at) AS last_seen
             FROM team_runtime_nodes
             WHERE tenant_id = ? AND user_id IN (${userIds.map(() => '?').join(',')})
             GROUP BY user_id`
          ).all(adminTenantId, ...userIds) as Array<{ user_id: string; last_seen: number | null }>)
        : [];
      const heartbeatByUser = new Map<string, number>();
      for (const row of heartbeatRows) {
        if (row.last_seen) heartbeatByUser.set(row.user_id, row.last_seen);
      }

      // 任务统计：返回全量累计（无今日过滤），与 UI 文案"任务完成"对齐。
      const taskRows = userIds.length > 0
        ? (driver.prepare(
            `SELECT owner, status, COUNT(*) as cnt FROM team_tasks
             WHERE tenant_id = ? AND owner IN (${userIds.map(() => '?').join(',')})
             GROUP BY owner, status`
          ).all(adminTenantId, ...userIds) as Array<{ owner: string; status: string; cnt: number }>)
        : [];

      const tasksByUser = new Map<string, { total: number; completed: number; inProgress: number }>();
      for (const row of taskRows) {
        const entry = tasksByUser.get(row.owner) ?? { total: 0, completed: 0, inProgress: 0 };
        entry.total += row.cnt;
        if (row.status === 'completed') entry.completed += row.cnt;
        if (row.status === 'in_progress') entry.inProgress += row.cnt;
        tasksByUser.set(row.owner, entry);
      }

      res.json({
        success: true,
        data: users.map((u) => {
          const lastLogin = u.last_login ?? 0;
          const lastSeen = heartbeatByUser.get(u.id) ?? 0;
          const isOnline = lastSeen > 0 && (now - lastSeen) < ONLINE_THRESHOLD_MS;
          const tasks = tasksByUser.get(u.id) ?? { total: 0, completed: 0, inProgress: 0 };
          return {
            id: u.id,
            username: u.username,
            role: u.role,
            last_login: lastLogin,
            is_online: isOnline,
            tasks_total: tasks.total,
            tasks_completed: tasks.completed,
            tasks_in_progress: tasks.inProgress,
          };
        }),
      });
    } catch (err) {
      console.error('[AdminRoute] member-dashboard error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/agent-token-usage — per digital employee / agent session token totals
  // 企业版：admin 看全租户聚合；个人版：任意已认证用户看自己 tenant_id='default' 的会话聚合。
  app.get('/api/admin/agent-token-usage', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const daysRaw = Number(req.query.days);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 30;
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const rows = await aggregateAgentTokenUsageForTenant(tenantId, { sinceMs });
      const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
      res.json({
        success: true,
        data: {
          days,
          totalTokens,
          agents: rows,
        },
      });
    } catch (err) {
      console.error('[AdminRoute] agent-token-usage error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * =========================
   * Team & RBAC Admin APIs
   * =========================
   *
   */

  // GET /api/admin/teams — list teams (admin: all; member: joined teams only)
  app.get('/api/admin/teams', apiRateLimiter, auth, async (req, res) => {
    try {
      const db = await getDatabase();
      const driver = db.getDriver();
      const tenantId = resolveAdminTenantId(req);
      const isAdmin = isEnterpriseAdminRole(req.user!.role);
      const rows = (isAdmin
        ? driver
          .prepare(
            `SELECT id, tenant_id, user_id, name, workspace, workspace_mode, lead_agent_id, agents, created_at, updated_at
             FROM teams
             WHERE tenant_id = ?
             ORDER BY updated_at DESC`
          )
          .all(tenantId)
        : driver
          .prepare(
            `SELECT t.id, t.tenant_id, t.user_id, t.name, t.workspace, t.workspace_mode, t.lead_agent_id, t.agents, t.created_at, t.updated_at
             FROM teams t
             INNER JOIN team_memberships m ON m.team_id = t.id AND m.tenant_id = t.tenant_id
             WHERE t.tenant_id = ? AND m.user_id = ?
             ORDER BY t.updated_at DESC`
          )
          .all(tenantId, req.user!.id)) as Array<Record<string, unknown>>;
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[AdminRoute] listTeams error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/teams — create a team (owner = current admin user)
  app.post('/api/admin/teams', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const name = String(req.body?.name ?? '').trim();
      const workspace = String(req.body?.workspace ?? '').trim();
      const workspaceMode = String(req.body?.workspace_mode ?? 'shared');
      if (!name) {
        res.status(400).json({ success: false, message: 'name required' });
        return;
      }
      if (!workspace) {
        res.status(400).json({ success: false, message: 'workspace required' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const id = randomUUID();
      const now = Date.now();
      // 使用事务保护：创建团队 + 添加成员必须原子操作
      // Transaction protection: create team + add member must be atomic
      const createTeamTransaction = driver.transaction(() => {
        // Existing schema keeps lead_agent_id as NOT NULL with '' default,
        // so new teams must follow the persisted contract until the schema changes.
        driver.prepare(
          `INSERT INTO teams (id, tenant_id, user_id, name, workspace, workspace_mode, lead_agent_id, agents, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', '[]', ?, ?)`
        ).run(id, tenantId, req.user!.id, name, workspace, workspaceMode, now, now);
        driver.prepare(
          `INSERT INTO team_memberships (tenant_id, team_id, user_id, role, created_at, updated_at)
           VALUES (?, ?, ?, 'owner', ?, ?)
           ON CONFLICT(team_id, user_id) DO UPDATE SET role='owner', updated_at=excluded.updated_at`
        ).run(tenantId, id, req.user!.id, now, now);
      });
      createTeamTransaction();

      res.json({ success: true, data: { id } });
    } catch (err) {
      console.error('[AdminRoute] createTeam error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/teams/:id — update team profile
  app.patch('/api/admin/teams/:id', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const teamId = String(req.params.id);
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const workspace = typeof req.body?.workspace === 'string' ? req.body.workspace.trim() : '';
      const workspaceMode =
        typeof req.body?.workspace_mode === 'string' ? req.body.workspace_mode.trim() : '';

      const updates: string[] = [];
      const values: Array<string | number> = [];
      if (name) {
        updates.push('name = ?');
        values.push(name);
      }
      if (workspace) {
        updates.push('workspace = ?');
        values.push(workspace);
      }
      if (workspaceMode) {
        updates.push('workspace_mode = ?');
        values.push(workspaceMode);
      }
      if (updates.length === 0) {
        res.status(400).json({ success: false, message: 'no fields to update' });
        return;
      }

      const db = await getDatabase();
      const driver = db.getDriver();
      const now = Date.now();
      updates.push('updated_at = ?');
      values.push(now, tenantId, teamId);
      driver
        .prepare(
          `UPDATE teams SET ${updates.join(', ')}
           WHERE tenant_id = ? AND id = ?`
        )
        .run(...values);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] updateTeam error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/teams/:id/members — list members
  app.get('/api/admin/teams/:id/members', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const teamId = String(req.params.id);
      const db = await getDatabase();
      const driver = db.getDriver();
      const rows = driver
        .prepare(
          `SELECT m.user_id, u.username, m.role, m.created_at, m.updated_at
           FROM team_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.tenant_id = ? AND m.team_id = ?
           ORDER BY CASE m.role
             WHEN 'owner' THEN 0
             WHEN 'admin' THEN 1
             WHEN 'member' THEN 2
             ELSE 3
           END, u.username ASC`
        )
        .all(tenantId, teamId) as Array<Record<string, unknown>>;
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[AdminRoute] listTeamMembers error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/teams/:id/members — add member
  app.post('/api/admin/teams/:id/members', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const teamId = String(req.params.id);
      const userId = String(req.body?.userId ?? '');
      const role = String(req.body?.role ?? 'member');
      if (!userId) {
        res.status(400).json({ success: false, message: 'userId required' });
        return;
      }
      if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
        res.status(400).json({ success: false, message: 'invalid role' });
        return;
      }
      const memberUser = await UserRepository.findById(userId);
      if (!memberUser) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const db = await getDatabase();
      const driver = db.getDriver();
      const now = Date.now();
      // If the user is already a member, refuse to silently downgrade an owner.
      // Re-adding an existing owner with a lower role must go through the
      // dedicated update-member-role endpoint (which has last-owner protection).
      if (role !== 'owner') {
        const existingMembership = driver
          .prepare(`SELECT role FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`)
          .get(tenantId, teamId, userId) as { role: string } | undefined;
        if (existingMembership?.role === 'owner') {
          res.status(400).json({
            success: false,
            message: '该成员是团队 owner，不能通过添加成员接口降级，请使用修改成员角色接口',
          });
          return;
        }
      }
      driver.prepare(
        `INSERT INTO team_memberships (tenant_id, team_id, user_id, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role=excluded.role, updated_at=excluded.updated_at`
      ).run(tenantId, teamId, userId, role, now, now);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] addTeamMember error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/teams/:id/members/:userId — update member role
  app.patch('/api/admin/teams/:id/members/:userId', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const teamId = String(req.params.id);
      const userId = String(req.params.userId);
      const role = String(req.body?.role ?? '');
      if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
        res.status(400).json({ success: false, message: 'invalid role' });
        return;
      }
      const db = await getDatabase();
      const driver = db.getDriver();
      // Last-owner protection: cannot demote/remove the only owner.
      const currentMembership = driver
        .prepare(`SELECT role FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`)
        .get(tenantId, teamId, userId) as { role: string } | undefined;
      if (currentMembership?.role === 'owner' && role !== 'owner') {
        const ownerCountRow = driver
          .prepare(`SELECT COUNT(*) AS cnt FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND role = 'owner'`)
          .get(tenantId, teamId) as { cnt: number };
        if (ownerCountRow.cnt <= 1) {
          res.status(400).json({ success: false, message: '不能降级团队唯一的 owner，请先添加另一个 owner' });
          return;
        }
      }
      const now = Date.now();
      driver.prepare(
        `UPDATE team_memberships SET role = ?, updated_at = ?
         WHERE tenant_id = ? AND team_id = ? AND user_id = ?`
      ).run(role, now, tenantId, teamId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] updateTeamMember error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/teams/:id/members/:userId — remove member
  app.delete('/api/admin/teams/:id/members/:userId', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const tenantId = resolveAdminTenantId(req);
      const teamId = String(req.params.id);
      const userId = String(req.params.userId);
      const db = await getDatabase();
      const driver = db.getDriver();
      // Last-owner protection: cannot remove the only owner.
      const currentMembership = driver
        .prepare(`SELECT role FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`)
        .get(tenantId, teamId, userId) as { role: string } | undefined;
      if (currentMembership?.role === 'owner') {
        const ownerCountRow = driver
          .prepare(`SELECT COUNT(*) AS cnt FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND role = 'owner'`)
          .get(tenantId, teamId) as { cnt: number };
        if (ownerCountRow.cnt <= 1) {
          res.status(400).json({ success: false, message: '不能移除团队唯一的 owner，请先添加另一个 owner' });
          return;
        }
      }
      driver.prepare(`DELETE FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`).run(tenantId, teamId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] removeTeamMember error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/auth/identities — 绑定外部身份
  app.post('/api/admin/auth/identities', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const provider = String(req.body?.provider ?? '');
      const userId = String(req.body?.userId ?? '');
      const externalId = String(req.body?.externalId ?? '');
      if (!isConfigurableAuthProvider(provider)) {
        res.status(400).json({ success: false, message: 'Unsupported provider' });
        return;
      }
      if (!userId || !externalId) {
        res.status(400).json({ success: false, message: 'userId/externalId required' });
        return;
      }
      if (PROTECTED_IDS.has(userId)) {
        res.status(403).json({ success: false, message: '不能绑定系统用户' });
        return;
      }
      // Ensure user exists
      const user = await UserRepository.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      await AuthIdentityRepository.bind(provider, externalId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] bindIdentity error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/auth/identities — 解绑外部身份（按 userId）
  app.delete('/api/admin/auth/identities', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const provider = String(req.body?.provider ?? '');
      const userId = String(req.body?.userId ?? '');
      if (!isConfigurableAuthProvider(provider)) {
        res.status(400).json({ success: false, message: 'Unsupported provider' });
        return;
      }
      if (!userId) {
        res.status(400).json({ success: false, message: 'userId required' });
        return;
      }
      if (PROTECTED_IDS.has(userId)) {
        res.status(403).json({ success: false, message: '不能解绑系统用户' });
        return;
      }
      await AuthIdentityRepository.unbindUser(provider, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] unbindIdentity error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/users — 创建用户
  app.post('/api/admin/users', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username?.trim() || !password?.trim()) {
        res.status(400).json({ success: false, message: '用户名和密码不能为空' });
        return;
      }
      const existing = await UserRepository.findByUsername(username.trim());
      if (existing) {
        res.status(409).json({ success: false, message: '用户名已存在' });
        return;
      }
      const passwordHash = await AuthService.hashPassword(password);
      const mappedRole = role === 'admin' ? 'org_admin' : 'member';
      const user = await UserRepository.createUserWithRole(username.trim(), passwordHash, mappedRole);
      await UserRepository.updateTenantId(user.id, resolveAdminTenantId(req));
      res.json({ success: true, data: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      console.error('[AdminRoute] createUser error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/users/:id/role — 修改角色
  app.patch('/api/admin/users/:id/role', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const role = String(req.body.role);
      if (!['member', 'org_admin', 'system_admin', 'user', 'admin'].includes(role)) {
        res.status(400).json({ success: false, message: 'role 参数非法' });
        return;
      }
      if (PROTECTED_IDS.has(id)) {
        res.status(403).json({ success: false, message: '不能修改系统用户' });
        return;
      }
      type DbRole = 'member' | 'org_admin' | 'system_admin';
      const roleMap: Record<string, DbRole> = {
        admin: 'org_admin',
        user: 'member',
        member: 'member',
        org_admin: 'org_admin',
        system_admin: 'system_admin',
      };
      const mapped = roleMap[role];
      if (mapped === 'system_admin' && !isSystemAdminRole(req.user!.role)) {
        res.status(403).json({
          success: false,
          code: 'SYSTEM_ADMIN_REQUIRED',
          message: '仅系统管理员可为其他用户开启 system_admin 权限',
        });
        return;
      }
      const target = await UserRepository.findById(id);
      // Cross-tenant guard: admin may only modify users in their own tenant.
      const targetTenantId = (target as { tenant_id?: string | null } | null)?.tenant_id ?? 'default';
      if (targetTenantId !== resolveAdminTenantId(req)) {
        res.status(403).json({ success: false, message: '不能修改其他企业的用户' });
        return;
      }
      if (target && isSystemAdminRole(target.role) && mapped !== 'system_admin') {
        await assertCanRevokeSystemAdmin(id);
      }
      const wasSystemAdmin = target ? isSystemAdminRole(target.role) : false;
      await UserRepository.setRole(id, mapped);
      if (mapped === 'system_admin' && !wasSystemAdmin) {
        void recordGovernanceAudit(req, GOVERNANCE_AUDIT_ACTIONS.grantSystemAdmin, id, target?.username);
      } else if (wasSystemAdmin && mapped !== 'system_admin') {
        void recordGovernanceAudit(req, GOVERNANCE_AUDIT_ACTIONS.revokeSystemAdmin, id, target?.username);
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof InstanceGovernanceError) {
        res.status(403).json({ success: false, code: err.code, message: err.message });
        return;
      }
      console.error('[AdminRoute] setRole error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/instance/claim-system-admin — one-time bootstrap when no system_admin exists
  app.post(
    '/api/admin/instance/claim-system-admin',
    apiRateLimiter,
    auth,
    async (req: Request, res: Response) => {
      try {
        const actorId = req.user!.id;
        await claimSystemAdmin(actorId, req.user!.role);
        void recordGovernanceAudit(req, GOVERNANCE_AUDIT_ACTIONS.claimSystemAdmin, actorId, req.user!.username);
        res.json({ success: true, data: { role: 'system_admin' } });
      } catch (err) {
        if (err instanceof InstanceGovernanceError) {
          res.status(403).json({ success: false, code: err.code, message: err.message });
          return;
        }
        console.error('[AdminRoute] claim-system-admin error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // PATCH /api/admin/users/:id/password — 重置密码（admin）
  app.patch('/api/admin/users/:id/password', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const password = String(req.body.password ?? '');
      const emailCode = String(req.body.emailCode ?? '');
      if (!password?.trim()) {
        res.status(400).json({ success: false, message: '密码不能为空' });
        return;
      }

      if (!emailCode?.trim()) {
        res.status(400).json({ success: false, message: '请输入邮箱验证码' });
        return;
      }

      await WebuiService.resetUserPasswordWithEmailCode(id, password, emailCode);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] resetPassword error:', err);
      const msg = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ success: false, message: msg });
    }
  });

  // POST /api/admin/users/reset-password-email-code — 发送管理员重置密码邮箱验证码
  app.post('/api/admin/users/reset-password-email-code', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const data = await WebuiService.requestResetPasswordEmailCode();
      res.json({ success: true, data: { maskedEmail: data.maskedEmail } });
    } catch (err) {
      console.error('[AdminRoute] sendResetPasswordEmailCode error:', err);
      const msg = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ success: false, message: msg });
    }
  });

  // GET /api/admin/system/admin-email — 当前管理员邮箱
  app.get('/api/admin/system/admin-email', apiRateLimiter, auth, requireAdmin, async (_req, res) => {
    try {
      const adminUser = await UserRepository.getSystemUser();
      res.json({
        success: true,
        data: {
          email: adminUser?.email ?? '',
        },
      });
    } catch (err) {
      console.error('[AdminRoute] getAdminEmail error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PUT /api/admin/system/admin-email — 设置管理员邮箱（浏览器可用）
  app.put('/api/admin/system/admin-email', apiRateLimiter, auth, requireAdmin, rejectDesktopAuthConfigMutation, async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim();
      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required' });
        return;
      }

      await WebuiService.setAdminEmail(email);
      publishOrgConfigChanged({
        scope: 'admin-email',
        tenantId: resolveAdminTenantId(req),
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] setAdminEmail error:', err);
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ success: false, message });
    }
  });

  // GET /api/admin/org/edition-access — 企业团队版模式对成员的可见性
  app.get('/api/admin/org/edition-access', apiRateLimiter, auth, requireAdmin, async (_req, res) => {
    try {
      const settings = await getOrgEditionSettings();
      res.json({ success: true, data: settings });
    } catch (err) {
      console.error('[AdminRoute] getOrgEditionAccess error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PUT /api/admin/org/edition-access — 启用/禁用成员使用企业团队版模式切换
  app.put('/api/admin/org/edition-access', apiRateLimiter, auth, requireAdmin, rejectDesktopAuthConfigMutation, async (req, res) => {
    try {
      if (!isSystemAdminRole(req.user!.role)) {
        res.status(403).json({
          success: false,
          code: 'SYSTEM_ADMIN_REQUIRED',
          message: '仅系统管理员可修改企业团队版模式可见性',
        });
        return;
      }
      const editionSwitcherEnabled = Boolean(req.body?.editionSwitcherEnabled);
      await setOrgEditionSettings({ editionSwitcherEnabled });
      publishOrgConfigChanged({
        tenantId: resolveAdminTenantId(req),
        scope: 'edition-access',
      });
      res.json({ success: true, data: { editionSwitcherEnabled } });
    } catch (err) {
      console.error('[AdminRoute] setOrgEditionAccess error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/users/:id — 删除用户
  app.delete('/api/admin/users/:id', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (PROTECTED_IDS.has(id)) {
        res.status(403).json({ success: false, message: '不能删除系统用户' });
        return;
      }
      // 不能删除自己
      if (req.user?.id === id) {
        res.status(400).json({ success: false, message: '不能删除自己的账号' });
        return;
      }
      // Cross-tenant guard: admin may only delete users in their own tenant.
      const target = await UserRepository.findById(id);
      const targetTenantId = (target as { tenant_id?: string | null } | null)?.tenant_id ?? 'default';
      if (targetTenantId !== resolveAdminTenantId(req)) {
        res.status(403).json({ success: false, message: '不能删除其他企业的用户' });
        return;
      }
      await UserRepository.deleteUser(id);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] deleteUser error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/enterprise/setup — create tenant and assign current user (system_admin on default only)
  app.post(
    '/api/admin/enterprise/setup',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const name = String((req.body as { name?: unknown })?.name ?? '');
        const data = await createEnterpriseTenant(req.user!.id, name);
        res.json({ success: true, data });
      } catch (err) {
        if (err instanceof EnterpriseJoinError) {
          res.status(400).json({ success: false, code: err.code, message: err.message });
          return;
        }
        console.error('[AdminRoute] enterprise setup error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // GET /api/admin/enterprise — current tenant profile
  app.get('/api/admin/enterprise', apiRateLimiter, auth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = requireEnterpriseTenant(req, res);
      if (!tenantId) {
        return;
      }
      const db = await getDatabase();
      const driver = db.getDriver();
      const row = driver
        .prepare('SELECT id, name, created_at, updated_at FROM tenants WHERE id = ?')
        .get(tenantId) as
        | {
            id: string;
            name: string;
            created_at: number;
            updated_at: number;
          }
        | undefined;
      if (!row) {
        res.status(404).json({ success: false, message: 'Enterprise not found' });
        return;
      }
      res.json({ success: true, data: row });
    } catch (err) {
      console.error('[AdminRoute] get enterprise profile error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/enterprise — update current tenant profile
  app.patch(
    '/api/admin/enterprise',
    apiRateLimiter,
    auth,
    requireAdmin,
    rejectDesktopAuthConfigMutation,
    async (req: Request, res: Response) => {
      try {
        const tenantId = requireEnterpriseTenant(req, res);
        if (!tenantId) {
          return;
        }
        const name = String(req.body?.name ?? '').trim();
        if (!name) {
          res.status(400).json({ success: false, message: 'name required' });
          return;
        }
        const db = await getDatabase();
        const driver = db.getDriver();
        const now = Date.now();
        driver.prepare('UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?').run(name, now, tenantId);
        publishOrgConfigChanged({
          tenantId,
          scope: 'enterprise-profile',
        });
        res.json({ success: true });
      } catch (err) {
        console.error('[AdminRoute] update enterprise profile error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // GET /api/admin/enterprise/invites
  app.get(
    '/api/admin/enterprise/invites',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
          return;
        }
        const invites = await listEnterpriseInvites(tenantId);
        res.json({
          success: true,
          data: invites.map((inv) => ({
            ...inv,
            display_code:
              inv.code.length > 4 ? `${inv.code.slice(0, 4)}-${inv.code.slice(4)}` : inv.code,
          })),
        });
      } catch (err) {
        console.error('[AdminRoute] list enterprise invites error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // POST /api/admin/enterprise/invites
  app.post(
    '/api/admin/enterprise/invites',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
          return;
        }
        const body = req.body as { maxUses?: unknown; expiresInDays?: unknown };
        const maxUses =
          typeof body.maxUses === 'number' && body.maxUses > 0 ? Math.floor(body.maxUses) : null;
        const expiresInDays =
          typeof body.expiresInDays === 'number' && body.expiresInDays > 0
            ? Math.floor(body.expiresInDays)
            : null;
        const { invite, displayCode } = await createEnterpriseInvite({
          tenantId,
          createdBy: req.user!.id,
          maxUses,
          expiresInDays,
        });
        res.json({ success: true, data: { invite, displayCode } });
      } catch (err) {
        if (err instanceof EnterpriseJoinError) {
          res.status(400).json({ success: false, code: err.code, message: err.message });
          return;
        }
        console.error('[AdminRoute] create enterprise invite error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // DELETE /api/admin/enterprise/invites/:id
  app.delete(
    '/api/admin/enterprise/invites/:id',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
          return;
        }
        await revokeEnterpriseInvite(tenantId, String(req.params.id));
        res.json({ success: true });
      } catch (err) {
        if (err instanceof EnterpriseJoinError) {
          res.status(400).json({ success: false, code: err.code, message: err.message });
          return;
        }
        console.error('[AdminRoute] revoke enterprise invite error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // GET /api/admin/enterprise/member-count — connected client count
  app.get(
    '/api/admin/enterprise/member-count',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.json({ success: true, data: { count: 0 } });
          return;
        }
        const data = await getEnterpriseMemberCount(tenantId);
        res.json({ success: true, data });
      } catch (err) {
        console.error('[AdminRoute] member-count error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // GET /api/admin/enterprise/exit-password/status
  app.get(
    '/api/admin/enterprise/exit-password/status',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
          return;
        }
        const data = await getEnterpriseExitPasswordStatus(tenantId);
        res.json({ success: true, data });
      } catch (err) {
        console.error('[AdminRoute] exit-password status error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // PUT /api/admin/enterprise/exit-password
  app.put(
    '/api/admin/enterprise/exit-password',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
          return;
        }
        const password = String((req.body as { password?: unknown })?.password ?? '').trim();
        if (!password) {
          res.status(400).json({ success: false, message: '退出密码不能为空' });
          return;
        }
        await setEnterpriseExitPassword(tenantId, password);
        res.json({ success: true });
      } catch (err) {
        console.error('[AdminRoute] set exit-password error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  // DELETE /api/admin/enterprise/exit-password
  app.delete(
    '/api/admin/enterprise/exit-password',
    apiRateLimiter,
    auth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user?.tenant_id ?? 'default';
        if (!isEnterpriseTenantId(tenantId)) {
          res.status(400).json({ success: false, message: 'Join or create an enterprise first' });
          return;
        }
        await clearEnterpriseExitPassword(tenantId);
        res.json({ success: true });
      } catch (err) {
        console.error('[AdminRoute] clear exit-password error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );
}
