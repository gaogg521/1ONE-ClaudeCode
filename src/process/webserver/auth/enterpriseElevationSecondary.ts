/**
 * Lists secondary verification options and verifies password-based elevation (local + LDAP).
 * OAuth providers (Feishu/DingTalk/WeCom) use separate endpoints once implemented.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthService } from '@process/webserver/auth/service/AuthService';
import { AuthProviderRepository } from '@process/webserver/auth/repository/AuthProviderRepository';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import type { IUser } from '@process/services/database/types';
import {
  authenticateWithLdap,
  type LdapProviderConfig,
} from '@process/webserver/auth/providers/LdapAuthProvider';
import type {
  EnterpriseElevationPasswordMethod,
  EnterpriseElevationSecondaryOption,
} from '@/common/types/enterpriseElevation';

/** OAuth elevation flows not shipped yet — keep false until POST handlers exist. */
const FEISHU_OAUTH_ELEVATION_IMPLEMENTED = false;

export async function listEnterpriseSecondaryOptions(userId: string): Promise<EnterpriseElevationSecondaryOption[]> {
  const user = await UserRepository.findById(userId);
  const hasLocalHash = Boolean(user?.password_hash && String(user.password_hash).trim() !== '');

  const ldapRow = await AuthProviderRepository.getProvider('ldap');
  const ldapCfg = ldapRow?.config as Record<string, unknown> | undefined;
  const ldapServerOk =
    Boolean(ldapRow?.enabled) &&
    Boolean(String(ldapCfg?.url ?? '').trim()) &&
    Boolean(String(ldapCfg?.baseDN ?? '').trim());
  const ldapBound = await AuthIdentityRepository.getByUser('ldap', userId);
  const ldapAvailable = ldapServerOk && Boolean(ldapBound?.external_id);

  const feishuRow = await AuthProviderRepository.getProvider('feishu');
  const feishuBound = await AuthIdentityRepository.getByUser('feishu', userId);
  const feishuAvailable =
    FEISHU_OAUTH_ELEVATION_IMPLEMENTED &&
    Boolean(feishuRow?.enabled) &&
    Boolean(feishuBound?.external_id);

  return [
    { id: 'local_password', kind: 'password', available: hasLocalHash },
    { id: 'ldap', kind: 'password', available: ldapAvailable },
    { id: 'feishu', kind: 'oauth', available: feishuAvailable },
    { id: 'dingtalk', kind: 'oauth', available: false },
    { id: 'wecom', kind: 'oauth', available: false },
  ];
}

async function verifyWithLdap(user: IUser, password: string): Promise<boolean> {
  const ldapRow = await AuthProviderRepository.getProvider('ldap');
  if (!ldapRow?.enabled) return false;
  const cfg = ldapRow.config as unknown as LdapProviderConfig;
  if (!String(cfg?.url ?? '').trim() || !String(cfg?.baseDN ?? '').trim()) return false;
  try {
    const ldapResult = await authenticateWithLdap(user.username, password, cfg);
    const bound = await AuthIdentityRepository.getByUser('ldap', user.id);
    if (!bound?.external_id) return false;
    const a = String(bound.external_id).trim().toLowerCase();
    const b = String(ldapResult.externalId).trim().toLowerCase();
    return a === b;
  } catch (ldapErr) {
    console.error('[enterpriseElevation] LDAP verify:', ldapErr);
    return false;
  }
}

/**
 * Password-based verification for enterprise elevation cookie.
 */
export async function verifyEnterpriseElevationPassword(params: {
  user: IUser;
  password: string;
  method: EnterpriseElevationPasswordMethod;
}): Promise<boolean> {
  const { user, password, method } = params;
  const hasLocalHash = Boolean(user.password_hash && String(user.password_hash).trim() !== '');

  if (method === 'local_password') {
    if (!hasLocalHash) return false;
    return AuthService.verifyPassword(password, user.password_hash!);
  }

  if (method === 'ldap') {
    return verifyWithLdap(user, password);
  }

  // auto: local first, then LDAP
  if (hasLocalHash && (await AuthService.verifyPassword(password, user.password_hash!))) {
    return true;
  }
  return verifyWithLdap(user, password);
}

export function parseEnterpriseElevationPasswordMethod(raw: unknown): EnterpriseElevationPasswordMethod | null {
  if (raw === undefined || raw === null || raw === '') return 'auto';
  if (raw === 'auto' || raw === 'local_password' || raw === 'ldap') return raw;
  return null;
}
