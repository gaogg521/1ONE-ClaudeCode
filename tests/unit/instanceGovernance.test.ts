/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    countByRole: vi.fn(),
    setRole: vi.fn(),
    findById: vi.fn(),
  },
}));

import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import {
  assertCanRevokeSystemAdmin,
  claimSystemAdmin,
  getInstanceGovernance,
  InstanceGovernanceError,
} from '@process/webserver/auth/instanceGovernance';

describe('instanceGovernance', () => {
  it('allows org_admin to claim when no system_admin exists', async () => {
    vi.mocked(UserRepository.countByRole).mockResolvedValue(0);
    vi.mocked(UserRepository.setRole).mockResolvedValue(undefined);

    const governance = await getInstanceGovernance('org_admin');
    expect(governance.hasSystemAdmin).toBe(false);
    expect(governance.canClaimSystemAdmin).toBe(true);

    await claimSystemAdmin('user-1', 'org_admin');
    expect(UserRepository.setRole).toHaveBeenCalledWith('user-1', 'system_admin');
  });

  it('rejects claim when a system_admin already exists', async () => {
    vi.mocked(UserRepository.countByRole).mockResolvedValue(1);

    const governance = await getInstanceGovernance('org_admin');
    expect(governance.canClaimSystemAdmin).toBe(false);

    await expect(claimSystemAdmin('user-2', 'org_admin')).rejects.toBeInstanceOf(InstanceGovernanceError);
  });

  it('prevents revoking the last system_admin', async () => {
    vi.mocked(UserRepository.findById).mockResolvedValue({
      id: 'only-admin',
      username: 'admin',
      role: 'system_admin',
      tenant_id: 'default',
      password_hash: 'x',
      created_at: 0,
      updated_at: 0,
    } as Awaited<ReturnType<typeof UserRepository.findById>>);
    vi.mocked(UserRepository.countByRole).mockResolvedValue(1);

    await expect(assertCanRevokeSystemAdmin('only-admin')).rejects.toMatchObject({
      code: 'LAST_SYSTEM_ADMIN',
    });
  });
});
