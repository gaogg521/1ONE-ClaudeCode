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
const findByUsernameMock = vi.hoisted(() => vi.fn());
const createUserWithRoleMock = vi.hoisted(() => vi.fn());
const setRoleMock = vi.hoisted(() => vi.fn());
const getByExternalIdMock = vi.hoisted(() => vi.fn());
const bindMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());
const generateRandomPasswordMock = vi.hoisted(() => vi.fn());
const ensureUserJoinedDefaultEnterpriseMock = vi.hoisted(() => vi.fn());
const updateUsernameMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findById: findByIdMock,
    findByUsername: findByUsernameMock,
    createUserWithRole: createUserWithRoleMock,
    setRole: setRoleMock,
    updateUsername: updateUsernameMock,
  },
}));

vi.mock('@process/webserver/auth/enterpriseAutoJoin', () => ({
  ensureUserJoinedDefaultEnterprise: (...args: unknown[]) => ensureUserJoinedDefaultEnterpriseMock(...args),
}));

vi.mock('@process/webserver/auth/repository/AuthIdentityRepository', () => ({
  AuthIdentityRepository: {
    getByExternalId: getByExternalIdMock,
    bind: bindMock,
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    hashPassword: hashPasswordMock,
    generateRandomPassword: generateRandomPasswordMock,
  },
}));

vi.mock('@process/services/user/userProfileService', () => ({
  updateUserOrgProfile: vi.fn(),
}));

import { resolveOrProvisionSsoUser } from '@process/webserver/auth/ssoJitProvisioning';

describe('ssoJitProvisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareInstance.get.mockReturnValue({ id: 'tenant_acme' });
    hashPasswordMock.mockResolvedValue('hash');
    generateRandomPasswordMock.mockReturnValue('random');
    findByUsernameMock.mockResolvedValue(null);
    bindMock.mockResolvedValue(undefined);
    setRoleMock.mockResolvedValue(undefined);
    ensureUserJoinedDefaultEnterpriseMock.mockResolvedValue(true);
  });

  it('returns existing bound user on repeat SSO login', async () => {
    getByExternalIdMock.mockResolvedValue({ user_id: 'u1' });
    findByIdMock.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      role: 'member',
      tenant_id: 'tenant_acme',
    });

    const { user, created } = await resolveOrProvisionSsoUser('feishu', {
      externalId: 'ou_feishu_1',
      preferredUsername: 'alice',
    });

    expect(created).toBe(false);
    expect(user.id).toBe('u1');
    expect(createUserWithRoleMock).not.toHaveBeenCalled();
  });

  it('keeps Feishu display names with CJK characters', async () => {
    getByExternalIdMock.mockResolvedValue(null);
    createUserWithRoleMock.mockResolvedValue({
      id: 'u_zhao',
      username: '赵高',
      role: 'member',
      tenant_id: 'default',
    });
    findByIdMock.mockResolvedValue({
      id: 'u_zhao',
      username: '赵高',
      role: 'member',
      tenant_id: 'tenant_acme',
    });

    const { user, created } = await resolveOrProvisionSsoUser('feishu', {
      externalId: 'ou_feishu_zhao',
      preferredUsername: '赵高',
    });

    expect(created).toBe(true);
    expect(user.username).toBe('赵高');
    expect(createUserWithRoleMock).toHaveBeenCalledWith('赵高', 'hash', 'member');
  });

  it('upgrades generated sso_* username on repeat Feishu login', async () => {
    getByExternalIdMock.mockResolvedValue({ user_id: 'u1' });
    findByUsernameMock.mockResolvedValue(null);
    findByIdMock.mockImplementation(async () => ({
      id: 'u1',
      username: updateUsernameMock.mock.calls.length > 0 ? '赵高' : 'sso_6c307033',
      role: 'member',
      tenant_id: 'tenant_acme',
    }));

    const { user } = await resolveOrProvisionSsoUser('feishu', {
      externalId: 'ou_feishu_1',
      preferredUsername: '赵高',
    });

    expect(updateUsernameMock).toHaveBeenCalledWith('u1', '赵高');
    expect(user.username).toBe('赵高');
  });

  it('does not bind Feishu login to an unrelated existing username', async () => {
    getByExternalIdMock.mockResolvedValue(null);
    findByUsernameMock.mockResolvedValue({
      id: 'u_test_mail',
      username: '1onetest',
      role: 'member',
      tenant_id: 'tenant_acme',
    });
    createUserWithRoleMock.mockResolvedValue({
      id: 'u_new_feishu',
      username: '赵高',
      role: 'member',
      tenant_id: 'default',
    });
    findByIdMock.mockResolvedValue({
      id: 'u_new_feishu',
      username: '赵高',
      role: 'member',
      tenant_id: 'tenant_acme',
    });

    const { user, created } = await resolveOrProvisionSsoUser('feishu', {
      externalId: 'ou_feishu_new',
      preferredUsername: '赵高',
    });

    expect(created).toBe(true);
    expect(user.id).toBe('u_new_feishu');
    expect(bindMock).toHaveBeenCalledWith('feishu', 'ou_feishu_new', 'u_new_feishu');
    expect(bindMock).not.toHaveBeenCalledWith('feishu', 'ou_feishu_new', 'u_test_mail');
  });

  it('provisions user + identity on first Feishu login', async () => {
    getByExternalIdMock.mockResolvedValue(null);
    createUserWithRoleMock.mockResolvedValue({
      id: 'u_new',
      username: 'bob',
      role: 'member',
      tenant_id: 'default',
    });
    findByIdMock.mockResolvedValue({
      id: 'u_new',
      username: 'bob',
      role: 'member',
      tenant_id: 'tenant_acme',
    });

    const { user, created } = await resolveOrProvisionSsoUser('feishu', {
      externalId: 'ou_feishu_2',
      preferredUsername: 'bob',
    });

    expect(created).toBe(true);
    expect(user.username).toBe('bob');
    expect(bindMock).toHaveBeenCalledWith('feishu', 'ou_feishu_2', 'u_new');
    expect(ensureUserJoinedDefaultEnterpriseMock).toHaveBeenCalledWith('u_new');
  });

  it('persists system_admin role for repeated LDAP admin logins', async () => {
    getByExternalIdMock.mockResolvedValue({ user_id: 'u_admin' });
    findByIdMock.mockResolvedValue({
      id: 'u_admin',
      username: 'ldap-admin',
      role: 'member',
      tenant_id: 'tenant_acme',
    });

    const { resolveOrProvisionLdapUser } = await import('@process/webserver/auth/ssoJitProvisioning');
    const { user, created, isAdmin } = await resolveOrProvisionLdapUser('ldap-admin', {
      externalId: 'uid=ldap-admin,ou=admins,dc=example,dc=com',
      isAdmin: true,
      orgUnitPath: 'Admins',
    });

    expect(created).toBe(false);
    expect(isAdmin).toBe(true);
    expect(user.role).toBe('system_admin');
    expect(setRoleMock).toHaveBeenCalledWith('u_admin', 'system_admin');
  });
});
