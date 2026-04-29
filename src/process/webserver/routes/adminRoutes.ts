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
import { testLdapConnection, type LdapProviderConfig } from '../auth/providers/LdapAuthProvider';
import { testFeishuAppCredentials } from '../auth/providers/FeishuAuthProvider';
import { requireEnterpriseElevation } from '../auth/middleware/enterpriseElevationMiddleware';
import { isEnterpriseAdminRole, isSystemAdminRole } from '../auth/enterpriseRoles';

const PROTECTED_IDS = new Set(['system_default_user']);

/** Stored in `auth_providers` — extend when adding DingTalk/WeCom admin UI / login flows. */
const CONFIGURABLE_AUTH_PROVIDERS = ['ldap', 'feishu', 'dingtalk', 'wecom'] as const;
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
};

/** admin-only 中间件（与侧栏企业入口、二次验证资格一致，含旧版 `admin` 角色） */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !isEnterpriseAdminRole(req.user.role)) {
    res.status(403).json({ success: false, message: 'Admin only' });
    return;
  }
  next();
}

/** system-admin-only 中间件（配置认证提供方等敏感操作） */
function requireSystemAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !isSystemAdminRole(req.user.role)) {
    res.status(403).json({ success: false, message: 'System admin only' });
    return;
  }
  next();
}

export function registerAdminRoutes(app: Express): void {
  const auth = TokenMiddleware.validateToken({ responseType: 'json' });

  // GET /api/admin/auth/providers — 列出认证提供方（不含敏感配置）
  app.get('/api/admin/auth/providers', apiRateLimiter, auth, requireSystemAdmin, requireEnterpriseElevation, async (_req, res) => {
    try {
      const providers = await AuthProviderRepository.listProviders();
      res.json({ success: true, data: providers });
    } catch (err) {
      console.error('[AdminRoute] listAuthProviders error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/auth/providers/:provider — 获取提供方配置（敏感字段不回传明文）
  app.get('/api/admin/auth/providers/:provider', apiRateLimiter, auth, requireSystemAdmin, requireEnterpriseElevation, async (req, res) => {
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
      res.json({ success: true, data: { provider, enabled: row.enabled, config: cfg, updated_at: row.updated_at } });
    } catch (err) {
      console.error('[AdminRoute] getAuthProvider error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PUT /api/admin/auth/providers/:provider — 更新提供方配置
  app.put('/api/admin/auth/providers/:provider', apiRateLimiter, auth, requireSystemAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const provider = String(req.params.provider);
      if (!isConfigurableAuthProvider(provider)) {
        res.status(400).json({ success: false, message: 'Unsupported provider' });
        return;
      }
      const enabled = Boolean(req.body?.enabled);
      const config = (req.body?.config && typeof req.body.config === 'object') ? (req.body.config as Record<string, unknown>) : {};

      const existing = await AuthProviderRepository.getProvider(provider);
      const next = { ...existing?.config, ...config } as Record<string, unknown>;
      for (const key of MASK_SECRET_KEYS[provider]) {
        if (config[key] === '******') {
          next[key] = (existing?.config as Record<string, unknown>)?.[key] ?? '';
        }
      }
      await AuthProviderRepository.setProvider(provider, enabled, next);

      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] setAuthProvider error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/auth/providers/ldap/test — LDAP 连通性测试（合并已保存的密钥）
  app.post('/api/admin/auth/providers/ldap/test', apiRateLimiter, auth, requireSystemAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const bodyConfig =
        req.body?.config && typeof req.body.config === 'object' ? (req.body.config as Record<string, unknown>) : {};
      const existing = await AuthProviderRepository.getProvider('ldap');
      const merged = { ...existing?.config, ...bodyConfig } as Record<string, unknown>;
      if (merged.bindPassword === '******') {
        merged.bindPassword = (existing?.config as { bindPassword?: string })?.bindPassword ?? '';
      }
      await testLdapConnection(merged as LdapProviderConfig);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] ldap test error:', err);
      const message = err instanceof Error ? err.message : 'LDAP test failed';
      res.status(400).json({ success: false, message });
    }
  });

  // POST /api/admin/auth/providers/feishu/test — 飞书 App 凭证测试
  app.post('/api/admin/auth/providers/feishu/test', apiRateLimiter, auth, requireSystemAdmin, requireEnterpriseElevation, async (req, res) => {
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

  // GET /api/admin/users — 列出所有用户（admin）
  app.get('/api/admin/users', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (_req, res) => {
    try {
      const users = await UserRepository.listUsers();
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

  /**
   * =========================
   * Team & RBAC Admin APIs
   * =========================
   *
   * Note: current MVP assumes a single tenant: "default".
   * Multi-tenant routing will be added once tenant selection UI is in place.
   */

  // GET /api/admin/teams — list teams in tenant
  app.get('/api/admin/teams', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const db = await getDatabase();
      const driver = db.getDriver();
      const tenantId = 'default';
      const rows = driver
        .prepare(
          `SELECT id, tenant_id, user_id, name, workspace, workspace_mode, lead_agent_id, agents, created_at, updated_at
           FROM teams
           WHERE tenant_id = ?
           ORDER BY updated_at DESC`
        )
        .all(tenantId) as Array<Record<string, unknown>>;
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[AdminRoute] listTeams error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/teams — create a team (owner = current admin user)
  app.post('/api/admin/teams', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const tenantId = 'default';
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
      driver.prepare(
        `INSERT INTO teams (id, tenant_id, user_id, name, workspace, workspace_mode, lead_agent_id, agents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '', '[]', ?, ?)`
      ).run(id, tenantId, req.user!.id, name, workspace, workspaceMode, now, now);
      driver.prepare(
        `INSERT INTO team_memberships (tenant_id, team_id, user_id, role, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', ?, ?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role='owner', updated_at=excluded.updated_at`
      ).run(tenantId, id, req.user!.id, now, now);

      res.json({ success: true, data: { id } });
    } catch (err) {
      console.error('[AdminRoute] createTeam error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/admin/teams/:id/members — list members
  app.get('/api/admin/teams/:id/members', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const tenantId = 'default';
      const teamId = String(req.params.id);
      const db = await getDatabase();
      const driver = db.getDriver();
      const rows = driver
        .prepare(
          `SELECT m.user_id, u.username, m.role, m.created_at, m.updated_at
           FROM team_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.tenant_id = ? AND m.team_id = ?
           ORDER BY m.role DESC, u.username ASC`
        )
        .all(tenantId, teamId) as Array<Record<string, unknown>>;
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[AdminRoute] listTeamMembers error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/teams/:id/members — add member
  app.post('/api/admin/teams/:id/members', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const tenantId = 'default';
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
      const db = await getDatabase();
      const driver = db.getDriver();
      const now = Date.now();
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
  app.patch('/api/admin/teams/:id/members/:userId', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const tenantId = 'default';
      const teamId = String(req.params.id);
      const userId = String(req.params.userId);
      const role = String(req.body?.role ?? '');
      if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
        res.status(400).json({ success: false, message: 'invalid role' });
        return;
      }
      const db = await getDatabase();
      const driver = db.getDriver();
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
  app.delete('/api/admin/teams/:id/members/:userId', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const tenantId = 'default';
      const teamId = String(req.params.id);
      const userId = String(req.params.userId);
      const db = await getDatabase();
      const driver = db.getDriver();
      driver.prepare(`DELETE FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`).run(tenantId, teamId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] removeTeamMember error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/auth/identities — 绑定外部身份
  app.post('/api/admin/auth/identities', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
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
  app.delete('/api/admin/auth/identities', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
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
  app.post('/api/admin/users', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
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
      res.json({ success: true, data: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      console.error('[AdminRoute] createUser error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/users/:id/role — 修改角色
  app.patch('/api/admin/users/:id/role', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
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
      const mapped = role === 'admin' ? 'org_admin' : role === 'user' ? 'member' : (role as any);
      await UserRepository.setRole(id, mapped);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] setRole error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/users/:id/password — 重置密码（admin）
  app.patch('/api/admin/users/:id/password', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
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
  app.post('/api/admin/users/reset-password-email-code', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
    try {
      const data = await WebuiService.requestResetPasswordEmailCode();
      res.json({ success: true, data: { maskedEmail: data.maskedEmail } });
    } catch (err) {
      console.error('[AdminRoute] sendResetPasswordEmailCode error:', err);
      const msg = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ success: false, message: msg });
    }
  });

  // DELETE /api/admin/users/:id — 删除用户
  app.delete('/api/admin/users/:id', apiRateLimiter, auth, requireAdmin, requireEnterpriseElevation, async (req, res) => {
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
      await UserRepository.deleteUser(id);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] deleteUser error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
