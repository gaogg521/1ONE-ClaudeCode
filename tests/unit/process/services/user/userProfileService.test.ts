import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({
  default: {
    access: (...args: unknown[]) => accessMock(...args),
    mkdir: (...args: unknown[]) => mkdirMock(...args),
    writeFile: (...args: unknown[]) => writeFileMock(...args),
  },
}));

vi.mock('@process/utils/utils', () => ({
  getConfigPath: () => '/tmp/config',
}));

const resolveEnterpriseContextMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/enterpriseContext', () => ({
  resolveEnterpriseContext: (...args: unknown[]) => resolveEnterpriseContextMock(...args),
}));

const mockGet = vi.fn();
const mockAll = vi.fn();
const mockRun = vi.fn();

const mockDriver = {
  prepare: vi.fn(() => ({
    get: mockGet,
    all: mockAll,
    run: mockRun,
  })),
};

vi.mock('@process/services/database', () => ({
  getDatabase: async () => ({
    getDriver: () => mockDriver,
  }),
}));

import {
  buildAvatarPublicPath,
  getWorkspaceUserProfile,
  updateUserAvatar,
  updateUserOrgProfile,
} from '@process/services/user/userProfileService';

describe('userProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
    resolveEnterpriseContextMock.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantName: 'Acme Corp',
      joined: true,
    });
    mockAll.mockReturnValue([{ team_id: 'team-1', team_name: 'Platform', role: 'member' }]);
  });

  it('buildAvatarPublicPath includes cache buster', () => {
    expect(buildAvatarPublicPath(123456)).toBe('/api/auth/profile/avatar?ts=123456');
  });

  it('returns joined enterprise profile with teams and avatar url', async () => {
    mockGet.mockReturnValueOnce({
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'member',
      tenant_id: 'tenant-1',
      avatar_path: '/tmp/config/user-avatars/user-1.png',
      org_unit_path: '研发中心 / 平台组',
      updated_at: 999,
    });

    const profile = await getWorkspaceUserProfile('user-1');

    expect(profile).toMatchObject({
      userId: 'user-1',
      username: 'alice',
      tenantName: 'Acme Corp',
      joinedEnterprise: true,
      avatarUrl: '/api/auth/profile/avatar?ts=999',
      orgUnitPath: '研发中心 / 平台组',
      teams: [{ teamId: 'team-1', teamName: 'Platform', role: 'member' }],
    });
  });

  it('stores avatar file and updates user record', async () => {
    mockGet.mockReturnValueOnce({
      id: 'user-1',
      username: 'alice',
      email: null,
      role: 'member',
      tenant_id: 'tenant-1',
      avatar_path: '/tmp/config/user-avatars/user-1.png',
      updated_at: 1000,
    });

    const profile = await updateUserAvatar({
      userId: 'user-1',
      buffer: Buffer.from('avatar'),
      mimeType: 'image/png',
    });

    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/user-avatars[/\\]user-1\.png$/),
      Buffer.from('avatar')
    );
    expect(mockRun).toHaveBeenCalled();
    expect(profile?.avatarUrl).toContain('/api/auth/profile/avatar?ts=');
  });

  it('rejects unsupported avatar mime types', async () => {
    await expect(
      updateUserAvatar({
        userId: 'user-1',
        buffer: Buffer.from('avatar'),
        mimeType: 'application/pdf',
      })
    ).rejects.toThrow('Unsupported avatar format');
  });

  it('stores org unit path from SSO sync', async () => {
    await updateUserOrgProfile({
      userId: 'user-1',
      orgUnitPath: '研发中心 / 平台组',
      source: 'ldap',
    });

    expect(mockRun).toHaveBeenCalled();
  });

  it('does not throw when org profile columns are missing', async () => {
    mockRun.mockImplementationOnce(() => {
      throw new Error('no such column: org_unit_path');
    });

    await expect(
      updateUserOrgProfile({
        userId: 'user-1',
        orgUnitPath: '研发中心 / 平台组',
        source: 'ldap',
      })
    ).resolves.toBeUndefined();
  });
});
