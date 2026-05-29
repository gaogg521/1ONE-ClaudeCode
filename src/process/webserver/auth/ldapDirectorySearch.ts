/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthService } from '@process/webserver/auth/service/AuthService';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { assignEnterpriseOnDirectoryImport } from '@process/webserver/auth/enterpriseAutoJoin';
import {
  type LdapProviderConfig,
  searchLdapDirectory,
  type LdapDirectoryEntry,
} from '@process/webserver/auth/providers/LdapAuthProvider';
import { updateUserOrgProfile } from '@process/services/user/userProfileService';

export type { LdapDirectoryEntry };

export async function searchLdapDirectoryForAdmin(
  config: LdapProviderConfig,
  query: string,
  limit?: number
): Promise<LdapDirectoryEntry[]> {
  return searchLdapDirectory(config, query, limit);
}

async function syncLdapOrgProfile(userId: string, entry: LdapDirectoryEntry): Promise<void> {
  if (!entry.orgUnitPath?.trim()) {
    return;
  }
  await updateUserOrgProfile({
    userId,
    orgUnitPath: entry.orgUnitPath,
    source: 'ldap',
  });
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
      await assignEnterpriseOnDirectoryImport(user.id, options?.tenantId);
      await syncLdapOrgProfile(user.id, entry);
      return { userId: user.id, username: user.username, created: false };
    }
  }

  const byName = await UserRepository.findByUsername(username);
  if (byName) {
    await AuthIdentityRepository.bind('ldap', externalId, byName.id);
    await assignEnterpriseOnDirectoryImport(byName.id, options?.tenantId);
    await syncLdapOrgProfile(byName.id, entry);
    return { userId: byName.id, username: byName.username, created: false };
  }

  const password = AuthService.generateRandomPassword();
  const passwordHash = await AuthService.hashPassword(password);
  const created = await UserRepository.createUserWithRole(username, passwordHash, 'member');
  await AuthIdentityRepository.bind('ldap', externalId, created.id);
  await assignEnterpriseOnDirectoryImport(created.id, options?.tenantId);
  await syncLdapOrgProfile(created.id, entry);
  return { userId: created.id, username: created.username, created: true };
}
