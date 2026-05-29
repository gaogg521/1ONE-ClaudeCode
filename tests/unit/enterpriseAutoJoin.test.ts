/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepareInstance = vi.hoisted(() => ({
  get: vi.fn(),
}));

const mockDriver = vi.hoisted(() => ({
  prepare: vi.fn(() => mockPrepareInstance),
}));

const mockDb = vi.hoisted(() => ({
  getDriver: vi.fn(() => mockDriver),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

const findByIdMock = vi.hoisted(() => vi.fn());
const updateTenantIdMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findById: findByIdMock,
    updateTenantId: updateTenantIdMock,
  },
}));

import {
  ensureUserJoinedDefaultEnterprise,
  ensureUserJoinedEnterpriseTenant,
  resolveDefaultEnterpriseTenantId,
} from '@process/webserver/auth/enterpriseAutoJoin';

describe('enterpriseAutoJoin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareInstance.get.mockReset();
    updateTenantIdMock.mockReset();
    findByIdMock.mockReset();
  });

  it('resolves oldest tenant as default enterprise', async () => {
    mockPrepareInstance.get.mockReturnValue({ id: 'tenant_acme' });
    await expect(resolveDefaultEnterpriseTenantId()).resolves.toBe('tenant_acme');
  });

  it('auto-joins placeholder tenant users on SSO login', async () => {
    mockPrepareInstance.get.mockReturnValue({ id: 'tenant_acme' });
    findByIdMock.mockResolvedValue({
      id: 'u1',
      username: 'bob',
      tenant_id: 'default',
      role: 'member',
    });

    const joined = await ensureUserJoinedDefaultEnterprise('u1');

    expect(joined).toBe(true);
    expect(updateTenantIdMock).toHaveBeenCalledWith('u1', 'tenant_acme');
  });

  it('skips users already in an enterprise tenant', async () => {
    findByIdMock.mockResolvedValue({
      id: 'u1',
      username: 'bob',
      tenant_id: 'tenant_acme',
      role: 'member',
    });

    const joined = await ensureUserJoinedDefaultEnterprise('u1');

    expect(joined).toBe(false);
    expect(updateTenantIdMock).not.toHaveBeenCalled();
  });

  it('does not override explicit tenant on directory import', async () => {
    findByIdMock.mockResolvedValue({
      id: 'u1',
      username: 'bob',
      tenant_id: 'default',
      role: 'member',
    });

    await ensureUserJoinedEnterpriseTenant('u1', 'tenant_other');

    expect(updateTenantIdMock).toHaveBeenCalledWith('u1', 'tenant_other');
  });
});
