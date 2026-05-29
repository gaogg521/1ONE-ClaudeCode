/**
 * JIT user provisioning for enterprise SSO (Feishu / DingTalk / WeCom / LDAP).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'node:crypto';
import type { AuthProviderType } from '@process/services/database/types';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import { UserRepository, type AuthUser } from '@process/webserver/auth/repository/UserRepository';
import { ensureUserJoinedDefaultEnterprise } from '@process/webserver/auth/enterpriseAutoJoin';
import { updateUserOrgProfile } from '@process/services/user/userProfileService';

export type SsoProviderId = Extract<AuthProviderType, 'ldap' | 'feishu' | 'dingtalk' | 'wecom'>;

export type SsoProvisionProfile = {
  externalId: string;
  /** Preferred local login name (LDAP sAMAccountName, email local-part, display name, etc.) */
  preferredUsername: string;
  orgUnitPath?: string | null;
  orgSource?: 'ldap' | 'feishu';
};

function sanitizeUsername(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const cleaned = trimmed.replace(/[^a-z0-9._@-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 64);
  }
  return `sso_${randomBytes(4).toString('hex')}`;
}

async function allocateUniqueUsername(preferred: string): Promise<string> {
  const base = sanitizeUsername(preferred);
  let candidate = base;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const existing = await UserRepository.findByUsername(candidate);
    if (!existing) {
      return candidate;
    }
    candidate = `${base}_${attempt + 1}`;
  }
  return `${base}_${randomBytes(3).toString('hex')}`;
}

async function loadBoundUser(provider: SsoProviderId, externalId: string): Promise<AuthUser | null> {
  const identity = await AuthIdentityRepository.getByExternalId(provider, externalId);
  if (!identity) {
    return null;
  }
  return UserRepository.findById(identity.user_id);
}

async function createProvisionedUser(
  provider: SsoProviderId,
  externalId: string,
  preferredUsername: string,
  role: 'member' | 'org_admin' | 'system_admin' = 'member'
): Promise<AuthUser> {
  const username = await allocateUniqueUsername(preferredUsername);
  const passwordHash = await AuthService.hashPassword(AuthService.generateRandomPassword());
  const user = await UserRepository.createUserWithRole(username, passwordHash, role);
  await AuthIdentityRepository.bind(provider, externalId, user.id);
  await ensureUserJoinedDefaultEnterprise(user.id);
  return (await UserRepository.findById(user.id)) ?? user;
}

/**
 * OAuth (Feishu / DingTalk / WeCom): first login creates local user + identity binding automatically.
 */
export async function resolveOrProvisionSsoUser(
  provider: SsoProviderId,
  profile: SsoProvisionProfile
): Promise<{ user: AuthUser; created: boolean }> {
  const externalId = profile.externalId.trim();
  if (!externalId) {
    throw Object.assign(new Error('Missing SSO external id'), { code: 'SSO_IDENTITY_MISSING' });
  }

  const bound = await loadBoundUser(provider, externalId);
  if (bound) {
    await ensureUserJoinedDefaultEnterprise(bound.id);
    const refreshed = (await UserRepository.findById(bound.id)) ?? bound;
    if (profile.orgUnitPath?.trim() && profile.orgSource) {
      try {
        await updateUserOrgProfile({
          userId: refreshed.id,
          orgUnitPath: profile.orgUnitPath,
          source: profile.orgSource,
        });
      } catch {
        // non-fatal
      }
    }
    return { user: refreshed, created: false };
  }

  const preferred = profile.preferredUsername.trim() || `${provider}_${externalId.slice(0, 16)}`;
  const byName = await UserRepository.findByUsername(sanitizeUsername(preferred));
  if (byName) {
    await AuthIdentityRepository.bind(provider, externalId, byName.id);
    await ensureUserJoinedDefaultEnterprise(byName.id);
    const refreshed = (await UserRepository.findById(byName.id)) ?? byName;
    return { user: refreshed, created: false };
  }

  const user = await createProvisionedUser(provider, externalId, preferred, 'member');
  if (profile.orgUnitPath?.trim() && profile.orgSource) {
    try {
      await updateUserOrgProfile({
        userId: user.id,
        orgUnitPath: profile.orgUnitPath,
        source: profile.orgSource,
      });
    } catch {
      // non-fatal
    }
  }
  return { user, created: true };
}

export type LdapAuthSuccess = {
  externalId: string;
  isAdmin: boolean;
  orgUnitPath: string | null;
};

/**
 * LDAP: successful directory auth provisions user on first login (no pre-bind required).
 */
export async function resolveOrProvisionLdapUser(
  loginUsername: string,
  ldap: LdapAuthSuccess
): Promise<{ user: AuthUser; created: boolean; isAdmin: boolean }> {
  const externalId = ldap.externalId.trim();
  if (!externalId) {
    throw Object.assign(new Error('Missing LDAP external id'), { code: 'LDAP_IDENTITY_MISSING' });
  }

  const bound = await loadBoundUser('ldap', externalId);
  if (bound) {
    await ensureUserJoinedDefaultEnterprise(bound.id);
    let user = (await UserRepository.findById(bound.id)) ?? bound;
    if (ldap.isAdmin && user.role !== 'system_admin') {
      await UserRepository.setRole(user.id, 'system_admin');
      user = { ...user, role: 'system_admin' };
    }
    if (ldap.orgUnitPath?.trim()) {
      try {
        await updateUserOrgProfile({ userId: user.id, orgUnitPath: ldap.orgUnitPath, source: 'ldap' });
      } catch {
        // non-fatal
      }
    }
    return { user, created: false, isAdmin: ldap.isAdmin };
  }

  const trimmedLogin = loginUsername.trim();
  const { user, created } = await resolveOrProvisionSsoUser('ldap', {
    externalId,
    preferredUsername: trimmedLogin,
    orgUnitPath: ldap.orgUnitPath,
    orgSource: 'ldap',
  });

  return { user, created, isAdmin: ldap.isAdmin };
}
