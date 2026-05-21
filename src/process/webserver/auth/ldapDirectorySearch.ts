/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_TENANT_ID, isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import {
  type LdapProviderConfig,
  searchLdapDirectory,
  type LdapDirectoryEntry,
} from '@process/webserver/auth/providers/LdapAuthProvider';

export type { LdapDirectoryEntry };

export async function searchLdapDirectoryForAdmin(
  config: LdapProviderConfig,
  query: string,
  limit?: number
): Promise<LdapDirectoryEntry[]> {
  return searchLdapDirectory(config, query, limit);
}

/**
 * Ensure a local user exists for an LDAP directory entry (bind by DN), then return user id.
 */
async function ensureUserTenant(userId: string, tenantId: string | undefined): Promise<void> {
  const tid = (tenantId ?? '').trim();
  if (!isEnterpriseTenantId(tid)) return;
  const user = await UserRepository.findById(userId);
  if (!user) return;
  const current = (user.tenant_id ?? DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
  if (current === tid) return;
  if (current === DEFAULT_TENANT_ID) {
    await UserRepository.updateTenantId(userId, tid);
  }
}

export async function resolveLocalUserForLdapEntry(
  entry: LdapDirectoryEntry,
  options?: { tenantId?: string }
): Promise<{
  userId: string;
  username: string;
  created: boolean;
}> {
  const externalId = entry.dn.trim();
  const username = entry.username.trim();
  if (!externalId || !username) {
    throw Object.assign(new Error('Invalid LDAP entry'), { code: 'LDAP_ENTRY_INVALID' });
  }

  const byExternal = await AuthIdentityRepository.getByExternalId('ldap', externalId);
  if (byExternal) {
    const user = await UserRepository.findById(byExternal.user_id);
    if (user) {
      await ensureUserTenant(user.id, options?.tenantId);
      return { userId: user.id, username: user.username, created: false };
    }
  }

  const byName = await UserRepository.findByUsername(username);
  if (byName) {
    await AuthIdentityRepository.bind('ldap', externalId, byName.id);
    await ensureUserTenant(byName.id, options?.tenantId);
    return { userId: byName.id, username: byName.username, created: false };
  }

  const password = AuthService.generateRandomPassword();
  const passwordHash = await AuthService.hashPassword(password);
  const created = await UserRepository.createUserWithRole(username, passwordHash, 'member');
  await AuthIdentityRepository.bind('ldap', externalId, created.id);
  await ensureUserTenant(created.id, options?.tenantId);
  return { userId: created.id, username: created.username, created: true };
}
