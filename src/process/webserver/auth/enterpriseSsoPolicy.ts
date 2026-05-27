/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProviderRepository } from './repository/AuthProviderRepository';

export const ENTERPRISE_SSO_PROVIDERS = ['ldap', 'feishu', 'dingtalk', 'wecom'] as const;

export type EnterpriseSsoProvider = (typeof ENTERPRISE_SSO_PROVIDERS)[number];

export function isEnterpriseSsoProvider(provider: string): provider is EnterpriseSsoProvider {
  return (ENTERPRISE_SSO_PROVIDERS as readonly string[]).includes(provider);
}

export async function listEnabledEnterpriseSsoProviders(
  exclude?: EnterpriseSsoProvider
): Promise<EnterpriseSsoProvider[]> {
  const enabled: EnterpriseSsoProvider[] = [];
  for (const provider of ENTERPRISE_SSO_PROVIDERS) {
    if (exclude && provider === exclude) {
      continue;
    }
    const row = await AuthProviderRepository.getProvider(provider);
    if (row?.enabled) {
      enabled.push(provider);
    }
  }
  return enabled;
}

export async function assertEnterpriseSsoEnableAllowed(input: {
  provider: EnterpriseSsoProvider;
  enabled: boolean;
  allowMultipleSso?: boolean;
}): Promise<{ ok: true } | { ok: false; conflicts: EnterpriseSsoProvider[] }> {
  if (!input.enabled) {
    return { ok: true };
  }
  if (input.allowMultipleSso) {
    return { ok: true };
  }
  const conflicts = await listEnabledEnterpriseSsoProviders(input.provider);
  if (conflicts.length === 0) {
    return { ok: true };
  }
  return { ok: false, conflicts };
}
