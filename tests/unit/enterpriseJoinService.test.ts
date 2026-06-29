/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepareInstance = vi.hoisted(() => ({
  run: vi.fn(() => ({ changes: 1 })),
  get: vi.fn(),
  all: vi.fn(() => []),
}));

const mockDriver = vi.hoisted(() => ({
  prepare: vi.fn(() => mockPrepareInstance),
  transaction: vi.fn((fn: () => void) => () => fn()),
}));

const mockDb = vi.hoisted(() => ({
  getDriver: vi.fn(() => mockDriver),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

const findByIdMock = vi.hoisted(() => vi.fn());
const updateTenantIdMock = vi.hoisted(() => vi.fn());
const setRoleMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findById: findByIdMock,
    updateTenantId: updateTenantIdMock,
    setRole: setRoleMock,
  },
}));

const invalidateAllTokensMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    invalidateAllTokens: invalidateAllTokensMock,
  },
}));

import {
  EnterpriseJoinError,
  createEnterpriseInvite,
  createEnterpriseTenant,
  joinEnterpriseWithInvite,
  normalizeInviteCode,
  previewEnterpriseInvite,
  revokeEnterpriseInvite,
} from '@process/webserver/auth/enterpriseJoinService';

const activeInviteRow = {
  id: 'inv_test1',
  tenant_id: 'tenant_acme',
  code: 'ABCD1234',
  created_by: 'admin-1',
  max_uses: null,
  use_count: 0,
  expires_at: null,
  created_at: Date.now(),
  revoked: 0,
};

describe('enterpriseJoinService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockReset();
    updateTenantIdMock.mockReset();
    setRoleMock.mockReset();
    invalidateAllTokensMock.mockReset();
    mockPrepareInstance.get.mockReset();
    mockPrepareInstance.run.mockReset();
    mockPrepareInstance.all.mockReset();
    mockPrepareInstance.run.mockReturnValue({ changes: 1 });
    mockPrepareInstance.all.mockReturnValue([]);
  });

  describe('normalizeInviteCode', () => {
    it('strips spaces and dashes and uppercases', () => {
      expect(normalizeInviteCode(' abcd-ef12 ')).toBe('ABCDEF12');
    });
  });

  describe('previewEnterpriseInvite', () => {
    it('rejects codes shorter than 6 characters', async () => {
      await expect(previewEnterpriseInvite('abc')).rejects.toMatchObject({
        code: 'INVALID_CODE',
      });
    });

    it('returns tenant preview for a valid invite', async () => {
      mockPrepareInstance.get
        .mockReturnValueOnce(activeInviteRow)
        .mockReturnValueOnce({ name: 'Acme Corp' });

      const preview = await previewEnterpriseInvite('ABCD-1234');
      // Security fix (6-25): preview must NOT leak tenantId/tenantName — only
      // confirm the code is valid. Tenant info is revealed only after joining.
      expect(preview).toEqual({ tenantId: '', tenantName: '', valid: true });
    });

    it('throws when invite is not found', async () => {
      mockPrepareInstance.get.mockReturnValueOnce(undefined);
      await expect(previewEnterpriseInvite('ZZZZ9999')).rejects.toBeInstanceOf(EnterpriseJoinError);
    });
  });

  describe('joinEnterpriseWithInvite', () => {
    it('rejects users already in an enterprise tenant', async () => {
      findByIdMock.mockResolvedValueOnce({
        id: 'u1',
        tenant_id: 'tenant_existing',
        role: 'member',
      });

      await expect(joinEnterpriseWithInvite('u1', 'ABCD1234')).rejects.toMatchObject({
        code: 'ALREADY_IN_ENTERPRISE',
      });
    });

    it('moves user to invite tenant and increments use count', async () => {
      findByIdMock.mockResolvedValueOnce({
        id: 'u1',
        tenant_id: 'default',
        role: 'member',
      });
      mockPrepareInstance.get
        .mockReturnValueOnce(activeInviteRow)
        .mockReturnValueOnce({ name: 'Acme Corp' });

      const result = await joinEnterpriseWithInvite('u1', 'abcd-1234');

      expect(mockDriver.transaction).toHaveBeenCalled();
      expect(mockPrepareInstance.run).toHaveBeenCalled();
      expect(invalidateAllTokensMock).toHaveBeenCalled();
      expect(updateTenantIdMock).not.toHaveBeenCalled();
      expect(result).toEqual({ tenantId: 'tenant_acme', tenantName: 'Acme Corp' });
    });
  });

  describe('createEnterpriseTenant', () => {
    it('requires a non-empty name', async () => {
      findByIdMock.mockResolvedValueOnce({
        id: 'admin',
        tenant_id: 'default',
        role: 'system_admin',
      });

      await expect(createEnterpriseTenant('admin', '   ')).rejects.toMatchObject({
        code: 'NAME_REQUIRED',
      });
    });

    it('rejects non system_admin users', async () => {
      findByIdMock.mockResolvedValueOnce({
        id: 'u1',
        tenant_id: 'default',
        role: 'member',
      });

      await expect(createEnterpriseTenant('u1', 'Acme')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('creates tenant and keeps creator as system_admin (no downgrade)', async () => {
      findByIdMock.mockResolvedValueOnce({
        id: 'admin',
        tenant_id: 'default',
        role: 'system_admin',
      });

      const result = await createEnterpriseTenant('admin', 'Acme Inc');

      expect(result.tenantName).toBe('Acme Inc');
      expect(result.tenantId).toMatch(/^tenant_/);
      expect(mockDriver.transaction).toHaveBeenCalled();
      expect(mockPrepareInstance.run).toHaveBeenCalled();
      expect(invalidateAllTokensMock).toHaveBeenCalled();
      const preparedSqls = mockDriver.prepare.mock.calls.map((c) => String(c[0]));
      // Moves the creator into the new tenant...
      expect(preparedSqls.some((sql) => /UPDATE\s+users\s+SET\s+tenant_id/i.test(sql))).toBe(true);
      // ...but never downgrades their role — that would leave the instance with no system_admin.
      expect(preparedSqls.some((sql) => /UPDATE\s+users\s+SET\s+role/i.test(sql))).toBe(false);
      expect(updateTenantIdMock).not.toHaveBeenCalled();
      expect(setRoleMock).not.toHaveBeenCalled();
    });
  });

  describe('createEnterpriseInvite', () => {
    it('throws when tenant does not exist', async () => {
      mockPrepareInstance.get.mockReturnValueOnce(undefined);

      await expect(
        createEnterpriseInvite({ tenantId: 'missing', createdBy: 'admin' })
      ).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });
  });

  describe('revokeEnterpriseInvite', () => {
    it('throws when invite id is unknown for tenant', async () => {
      mockPrepareInstance.run.mockReturnValueOnce({ changes: 0 });

      await expect(revokeEnterpriseInvite('tenant_acme', 'inv_missing')).rejects.toMatchObject({
        code: 'INVALID_CODE',
      });
    });
  });
});
