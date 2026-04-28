/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database/export';
import type { AuthProviderType, IAuthIdentityRow } from '@process/services/database/types';

export const AuthIdentityRepository = {
  async getByExternalId(provider: AuthProviderType, externalId: string): Promise<IAuthIdentityRow | null> {
    const db = await getDatabase();
    const res = db.getAuthIdentity(provider, externalId);
    if (!res.success) throw new Error(res.error || 'Failed to query auth identity');
    return res.data ?? null;
  },

  async getByUser(provider: AuthProviderType, userId: string): Promise<IAuthIdentityRow | null> {
    const db = await getDatabase();
    const res = db.getAuthIdentityByUser(provider, userId);
    if (!res.success) throw new Error(res.error || 'Failed to query auth identity');
    return res.data ?? null;
  },

  async listForUsers(userIds: string[]): Promise<IAuthIdentityRow[]> {
    const db = await getDatabase();
    const res = db.listAuthIdentitiesForUsers(userIds);
    if (!res.success) throw new Error(res.error || 'Failed to list auth identities');
    return res.data ?? [];
  },

  async bind(provider: AuthProviderType, externalId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    const res = db.setAuthIdentity(provider, externalId, userId);
    if (!res.success || !res.data) throw new Error(res.error || 'Failed to bind auth identity');
  },

  async unbind(provider: AuthProviderType, externalId: string): Promise<void> {
    const db = await getDatabase();
    const res = db.deleteAuthIdentity(provider, externalId);
    if (!res.success) throw new Error(res.error || 'Failed to unbind auth identity');
  },

  async unbindUser(provider: AuthProviderType, userId: string): Promise<void> {
    const db = await getDatabase();
    const res = db.deleteAuthIdentityByUser(provider, userId);
    if (!res.success) throw new Error(res.error || 'Failed to unbind auth identity');
  },
};

