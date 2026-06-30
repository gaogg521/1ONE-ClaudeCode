/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '@process/services/database';
import { DEFAULT_TENANT_ID, isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import type {
  EnterpriseInvitePreview,
  EnterpriseInviteRecord,
  EnterpriseJoinResult,
  EnterpriseSetupResult,
} from '@/common/types/enterpriseJoin';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { resolveEnterpriseContext } from './enterpriseContext';
import { UserRepository } from './repository/UserRepository';
import { AuthService } from './service/AuthService';

async function getSqliteDriver(): Promise<ISqliteDriver> {
  return (await getDatabase()).getDriver();
}

export type EnterpriseJoinErrorCode =
  | 'INVALID_CODE'
  | 'INVITE_EXPIRED'
  | 'INVITE_REVOKED'
  | 'INVITE_EXHAUSTED'
  | 'ALREADY_IN_ENTERPRISE'
  | 'NOT_IN_ENTERPRISE'
  | 'TENANT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'NAME_REQUIRED'
  | 'NO_EXIT_PASSWORD_SET'
  | 'WRONG_EXIT_CODE';

export class EnterpriseJoinError extends Error {
  readonly code: EnterpriseJoinErrorCode;

  constructor(code: EnterpriseJoinErrorCode, message: string) {
    super(message);
    this.name = 'EnterpriseJoinError';
    this.code = code;
  }
}

export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function formatInviteCodeForDisplay(code: string): string {
  const n = normalizeInviteCode(code);
  if (n.length <= 4) return n;
  return `${n.slice(0, 4)}-${n.slice(4)}`;
}

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function mapInviteRow(row: Record<string, unknown>): EnterpriseInviteRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    code: String(row.code),
    created_by: String(row.created_by),
    max_uses: row.max_uses === null || row.max_uses === undefined ? null : Number(row.max_uses),
    use_count: Number(row.use_count ?? 0),
    expires_at: row.expires_at === null || row.expires_at === undefined ? null : Number(row.expires_at),
    created_at: Number(row.created_at),
    revoked: Number(row.revoked) === 1,
  };
}

export async function previewEnterpriseInvite(codeRaw: string): Promise<EnterpriseInvitePreview> {
  const code = normalizeInviteCode(codeRaw);
  if (code.length < 6) {
    throw new EnterpriseJoinError('INVALID_CODE', 'Invalid invite code');
  }
  const invite = await findActiveInviteByCode(code);
  if (!invite) {
    throw new EnterpriseJoinError('INVALID_CODE', 'Invite code not found');
  }
  // 不再向预览端点泄露租户名/租户 ID（防止企业存在性枚举）。
  // 加入企业成功后再返回完整租户信息。
  return { tenantId: '', tenantName: '', valid: true };
}

async function findActiveInviteByCode(code: string): Promise<EnterpriseInviteRecord | null> {
  const driver = await getSqliteDriver();
  const row = driver
    .prepare(
      `SELECT id, tenant_id, code, created_by, max_uses, use_count, expires_at, created_at, revoked
       FROM tenant_invites WHERE code = ?`
    )
    .get(code) as Record<string, unknown> | undefined;
  if (!row) return null;
  const invite = mapInviteRow(row);
  if (invite.revoked) return null;
  if (invite.expires_at !== null && invite.expires_at < Date.now()) return null;
  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) return null;
  return invite;
}

export async function joinEnterpriseWithInvite(userId: string, codeRaw: string): Promise<EnterpriseJoinResult> {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new EnterpriseJoinError('FORBIDDEN', 'User not found');
  }
  if (isEnterpriseTenantId(user.tenant_id)) {
    throw new EnterpriseJoinError('ALREADY_IN_ENTERPRISE', 'Already joined an enterprise');
  }

  const code = normalizeInviteCode(codeRaw);
  const invite = await findActiveInviteByCode(code);
  if (!invite) {
    throw new EnterpriseJoinError('INVALID_CODE', 'Invite code not found or no longer valid');
  }

  const driver = await getSqliteDriver();
  // 使用事务保护：更新邀请使用次数 + 更新用户租户ID 必须原子操作
  // Transaction protection: update invite use_count + update user tenant_id must be atomic
  const joinTransaction = driver.transaction(() => {
    driver.prepare(`UPDATE tenant_invites SET use_count = use_count + 1 WHERE id = ?`).run(invite.id);
    driver.prepare(`UPDATE users SET tenant_id = ?, updated_at = ? WHERE id = ?`).run(invite.tenant_id, Date.now(), userId);
  });
  joinTransaction();
  await AuthService.invalidateAllTokens();

  const ctx = await resolveEnterpriseContext(invite.tenant_id);
  return { tenantId: ctx.tenantId, tenantName: ctx.tenantName };
}

export async function createEnterpriseTenant(
  userId: string,
  name: string
): Promise<EnterpriseSetupResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new EnterpriseJoinError('NAME_REQUIRED', 'Enterprise name is required');
  }
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new EnterpriseJoinError('FORBIDDEN', 'User not found');
  }
  if (isEnterpriseTenantId(user.tenant_id)) {
    throw new EnterpriseJoinError('ALREADY_IN_ENTERPRISE', 'Already in an enterprise');
  }
  if (user.role !== 'system_admin') {
    throw new EnterpriseJoinError('FORBIDDEN', 'Only system administrators can create an enterprise');
  }

  const tenantId = `tenant_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = Date.now();
  const driver = await getSqliteDriver();
  // 使用事务保护：创建租户 + 更新用户租户必须原子操作
  // Transaction protection: create tenant + move user into it must be atomic.
  // The creator KEEPS system_admin (instance-level governance) so they can manage
  // auth/invites and grant system_admin to teammates right after creating the org —
  // downgrading to org_admin here would leave the instance with no system_admin.
  const createTransaction = driver.transaction(() => {
    driver
      .prepare(`INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(tenantId, trimmed, now, now);
    driver
      .prepare(`UPDATE users SET tenant_id = ?, updated_at = ? WHERE id = ?`)
      .run(tenantId, now, userId);
  });
  createTransaction();
  await AuthService.invalidateAllTokens();

  return { tenantId, tenantName: trimmed };
}

export async function createEnterpriseInvite(params: {
  tenantId: string;
  createdBy: string;
  maxUses?: number | null;
  expiresInDays?: number | null;
}): Promise<{ invite: EnterpriseInviteRecord; displayCode: string }> {
  const driver = await getSqliteDriver();
  const tenant = driver.prepare(`SELECT id FROM tenants WHERE id = ?`).get(params.tenantId) as
    | { id: string }
    | undefined;
  if (!tenant) {
    throw new EnterpriseJoinError('TENANT_NOT_FOUND', 'Tenant not found');
  }

  const now = Date.now();
  let code = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const exists = driver.prepare(`SELECT 1 FROM tenant_invites WHERE code = ?`).get(code);
    if (!exists) break;
    code = generateInviteCode();
  }

  const expiresAt =
    params.expiresInDays && params.expiresInDays > 0
      ? now + params.expiresInDays * 24 * 60 * 60 * 1000
      : null;
  const maxUses = params.maxUses ?? null;
  const id = `inv_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  driver
    .prepare(
      `INSERT INTO tenant_invites (id, tenant_id, code, created_by, max_uses, use_count, expires_at, created_at, revoked)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`
    )
    .run(id, params.tenantId, code, params.createdBy, maxUses, expiresAt, now);

  const invite = mapInviteRow(
    driver
      .prepare(
        `SELECT id, tenant_id, code, created_by, max_uses, use_count, expires_at, created_at, revoked
         FROM tenant_invites WHERE id = ?`
      )
      .get(id) as Record<string, unknown>
  );

  return { invite, displayCode: formatInviteCodeForDisplay(code) };
}

export async function listEnterpriseInvites(tenantId: string): Promise<EnterpriseInviteRecord[]> {
  const driver = await getSqliteDriver();
  const rows = driver
    .prepare(
      `SELECT id, tenant_id, code, created_by, max_uses, use_count, expires_at, created_at, revoked
       FROM tenant_invites WHERE tenant_id = ? ORDER BY created_at DESC`
    )
    .all(tenantId) as Array<Record<string, unknown>>;
  return rows.map(mapInviteRow);
}

export async function revokeEnterpriseInvite(tenantId: string, inviteId: string): Promise<void> {
  const driver = await getSqliteDriver();
  const result = driver
    .prepare(`UPDATE tenant_invites SET revoked = 1 WHERE id = ? AND tenant_id = ?`)
    .run(inviteId, tenantId);
  if (result.changes === 0) {
    throw new EnterpriseJoinError('INVALID_CODE', 'Invite not found');
  }
}

/** Public: return the name of the enterprise hosted on this server, if any. */
export async function getEnterprisePublicInfo(): Promise<{ tenantName: string | null }> {
  const driver = await getSqliteDriver();
  const row = driver
    .prepare(`SELECT name FROM tenants WHERE id != 'default' ORDER BY created_at ASC LIMIT 1`)
    .get() as { name: string } | undefined;
  return { tenantName: row?.name ?? null };
}

/** Admin: return whether an exit password has been set for the tenant. */
export async function getEnterpriseExitPasswordStatus(tenantId: string): Promise<{ isSet: boolean }> {
  const driver = await getSqliteDriver();
  const row = driver
    .prepare(`SELECT exit_password_hash FROM tenants WHERE id = ?`)
    .get(tenantId) as { exit_password_hash: string | null } | undefined;
  return { isSet: !!row?.exit_password_hash };
}

/** Admin: set or replace the exit password for the tenant. */
export async function setEnterpriseExitPassword(tenantId: string, password: string): Promise<void> {
  const hash = await AuthService.hashPassword(password);
  const driver = await getSqliteDriver();
  driver
    .prepare(`UPDATE tenants SET exit_password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hash, Date.now(), tenantId);
}

/** Admin: remove the exit password, disabling client self-exit. */
export async function clearEnterpriseExitPassword(tenantId: string): Promise<void> {
  const driver = await getSqliteDriver();
  driver
    .prepare(`UPDATE tenants SET exit_password_hash = NULL, updated_at = ? WHERE id = ?`)
    .run(Date.now(), tenantId);
}

/** Auth: get count of members in the enterprise (users with this tenant_id). */
export async function getEnterpriseMemberCount(tenantId: string): Promise<{ count: number }> {
  const driver = await getSqliteDriver();
  const row = driver
    .prepare(`SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ?`)
    .get(tenantId) as { cnt: number };
  return { count: Number(row?.cnt ?? 0) };
}

/**
 * Client: leave the enterprise by verifying the server-set exit password.
 * Resets the user's tenant_id back to 'default'.
 */
export async function leaveEnterprise(userId: string, exitCode: string): Promise<void> {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new EnterpriseJoinError('FORBIDDEN', 'User not found');
  }
  if (!isEnterpriseTenantId(user.tenant_id)) {
    throw new EnterpriseJoinError('NOT_IN_ENTERPRISE', 'Not currently in an enterprise');
  }

  const driver = await getSqliteDriver();
  const tenant = driver
    .prepare(`SELECT exit_password_hash FROM tenants WHERE id = ?`)
    .get(user.tenant_id) as { exit_password_hash: string | null } | undefined;
  if (!tenant?.exit_password_hash) {
    throw new EnterpriseJoinError(
      'NO_EXIT_PASSWORD_SET',
      'The enterprise has not configured an exit password. Contact your administrator.'
    );
  }

  const valid = await AuthService.verifyPassword(exitCode, tenant.exit_password_hash);
  if (!valid) {
    throw new EnterpriseJoinError('WRONG_EXIT_CODE', 'Incorrect exit code');
  }

  driver
    .prepare(`UPDATE users SET tenant_id = 'default', updated_at = ? WHERE id = ?`)
    .run(Date.now(), userId);
  await AuthService.invalidateAllTokens();
}
