/**
 * Auto-assign users to the instance default enterprise tenant after SSO login.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import { DEFAULT_TENANT_ID, isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import { UserRepository, type AuthUser } from '@process/webserver/auth/repository/UserRepository';

/**
 * Primary enterprise for this instance (oldest tenant row).
 * Single-tenant deployments use it as the default org for SSO auto-join.
 */
export async function resolveDefaultEnterpriseTenantId(): Promise<string | null> {
  const driver = (await getDatabase()).getDriver();
  const row = driver.prepare("SELECT id FROM tenants WHERE id <> 'default' ORDER BY created_at ASC LIMIT 1").get() as
    | { id?: string }
    | undefined;
  const id = typeof row?.id === 'string' ? row.id.trim() : '';
  return isEnterpriseTenantId(id) ? id : null;
}

/**
 * When the user is still on the placeholder tenant, attach them to the default enterprise.
 * @returns true if tenant_id was updated
 */
export async function ensureUserJoinedDefaultEnterprise(userId: string): Promise<boolean> {
  const user = await UserRepository.findById(userId);
  if (!user) {
    return false;
  }
  if (isEnterpriseTenantId(user.tenant_id)) {
    return false;
  }
  const tenantId = await resolveDefaultEnterpriseTenantId();
  if (!tenantId) {
    return false;
  }
  await UserRepository.updateTenantId(userId, tenantId);
  return true;
}

/**
 * Admin directory import: assign explicit tenant when user is not in an enterprise yet.
 */
export async function ensureUserJoinedEnterpriseTenant(userId: string, tenantId: string | undefined): Promise<void> {
  const tid = (tenantId ?? '').trim();
  if (!isEnterpriseTenantId(tid)) {
    return;
  }
  const user = await UserRepository.findById(userId);
  if (!user) {
    return;
  }
  const current = (user.tenant_id ?? DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
  if (current === tid) {
    return;
  }
  if (current === DEFAULT_TENANT_ID) {
    await UserRepository.updateTenantId(userId, tid);
  }
}

/** Reload user after optional default-enterprise auto-join (for login response + redirect). */
export async function refreshUserAfterEnterpriseAutoJoin(user: AuthUser): Promise<AuthUser> {
  await ensureUserJoinedDefaultEnterprise(user.id);
  return (await UserRepository.findById(user.id)) ?? user;
}

/** LDAP 目录拉人：显式租户优先，否则落入实例默认企业。 */
export async function assignEnterpriseOnDirectoryImport(userId: string, tenantId?: string): Promise<void> {
  if (tenantId?.trim()) {
    await ensureUserJoinedEnterpriseTenant(userId, tenantId);
    return;
  }
  await ensureUserJoinedDefaultEnterprise(userId);
}
