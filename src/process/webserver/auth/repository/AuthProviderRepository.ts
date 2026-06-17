/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database/export';
import type { AuthProviderType, IAuthProviderRow } from '@process/services/database/types';
import { decryptString, encryptString } from '@process/channels/utils/credentialCrypto';

export type AuthProviderConfig = Record<string, unknown>;

function safeJsonParse(raw: string): AuthProviderConfig {
  if (!raw || raw.trim() === '') return {};
  try {
    return JSON.parse(raw) as AuthProviderConfig;
  } catch {
    return {};
  }
}

function safeJsonStringify(data: unknown): string {
  try {
    return JSON.stringify(data ?? {});
  } catch {
    return '{}';
  }
}

function encryptConfig(config: AuthProviderConfig, secretKeys: string[]): AuthProviderConfig {
  const next: AuthProviderConfig = { ...config };
  for (const key of secretKeys) {
    const v = next[key];
    if (typeof v === 'string' && v.trim() !== '') {
      next[key] = encryptString(v);
    }
  }
  return next;
}

function decryptConfig(config: AuthProviderConfig, secretKeys: string[]): AuthProviderConfig {
  const next: AuthProviderConfig = { ...config };
  for (const key of secretKeys) {
    const v = next[key];
    if (typeof v === 'string' && v.trim() !== '') {
      next[key] = decryptString(v);
    }
  }
  return next;
}

const SECRET_KEYS_BY_PROVIDER: Record<AuthProviderType, string[]> = {
  local: [],
  ldap: ['bindPassword'],
  feishu: ['appSecret'],
  dingtalk: ['appSecret', 'clientSecret'],
  wecom: ['secret'],
  smtp: ['pass'],
};

export const AuthProviderRepository = {
  async getProvider(
    provider: AuthProviderType
  ): Promise<(Omit<IAuthProviderRow, 'enabled'> & { enabled: boolean; config: AuthProviderConfig }) | null> {
    const db = await getDatabase();
    const row = db.getAuthProvider(provider);
    if (!row.success) throw new Error(row.error || 'Failed to load auth provider');
    if (!row.data) return null;
    const rawConfig = safeJsonParse(row.data.config_json);
    const config = decryptConfig(rawConfig, SECRET_KEYS_BY_PROVIDER[provider] ?? []);
    return {
      ...row.data,
      enabled: Number(row.data.enabled) === 1,
      config,
    };
  },

  async setProvider(provider: AuthProviderType, enabled: boolean, config: AuthProviderConfig): Promise<void> {
    const db = await getDatabase();
    const encrypted = encryptConfig(config, SECRET_KEYS_BY_PROVIDER[provider] ?? []);
    const ok = db.upsertAuthProvider(provider, enabled, safeJsonStringify(encrypted));
    if (!ok.success || !ok.data) throw new Error(ok.error || 'Failed to save auth provider');
  },

  async listProviders(): Promise<
    Array<{ provider: AuthProviderType; enabled: boolean; updated_at: number; hasConfig: boolean }>
  > {
    const db = await getDatabase();
    const res = db.listAuthProviders();
    if (!res.success) throw new Error(res.error || 'Failed to list auth providers');
    return (res.data ?? []).map((row) => ({
      provider: row.provider,
      enabled: row.enabled === 1,
      updated_at: row.updated_at,
      hasConfig: Boolean(row.config_json && row.config_json.trim() !== '' && row.config_json.trim() !== '{}'),
    }));
  },
};
