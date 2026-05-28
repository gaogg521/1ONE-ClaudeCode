/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminUserMock = vi.hoisted(() => vi.fn());
const getWorkspaceUserProfileMock = vi.hoisted(() => vi.fn());
const updateUserAvatarMock = vi.hoisted(() => vi.fn());
const resolveUserAvatarFileMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());

const providerHandlers = vi.hoisted(() => ({
  get: null as null | (() => Promise<unknown>),
  uploadAvatar: null as null | ((input: { mimeType: string; data: Uint8Array }) => Promise<unknown>),
  readAvatarBuffer: null as null | (() => Promise<unknown>),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  workspaceProfile: {
    get: {
      provider: (handler: () => Promise<unknown>) => {
        providerHandlers.get = handler;
      },
    },
    uploadAvatar: {
      provider: (handler: (input: { mimeType: string; data: Uint8Array }) => Promise<unknown>) => {
        providerHandlers.uploadAvatar = handler;
      },
    },
    readAvatarBuffer: {
      provider: (handler: () => Promise<unknown>) => {
        providerHandlers.readAvatarBuffer = handler;
      },
    },
  },
}));

vi.mock('@process/services/user/userProfileService', () => ({
  getWorkspaceUserProfile: (...args: unknown[]) => getWorkspaceUserProfileMock(...args),
  updateUserAvatar: (...args: unknown[]) => updateUserAvatarMock(...args),
  resolveUserAvatarFile: (...args: unknown[]) => resolveUserAvatarFileMock(...args),
}));

vi.mock('@process/bridge/services/WebuiService', () => ({
  WebuiService: {
    handleAsync: async (handler: () => Promise<unknown>) => handler(),
    getAdminUser: (...args: unknown[]) => getAdminUserMock(...args),
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => readFileMock(...args),
  },
}));

describe('workspaceProfileBridge', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    getAdminUserMock.mockResolvedValue({ id: 'admin-1', username: 'admin' });
    const { initWorkspaceProfileBridge } = await import('@process/bridge/workspaceProfileBridge');
    initWorkspaceProfileBridge();
  });

  it('returns workspace profile for the local admin user', async () => {
    const profile = {
      userId: 'admin-1',
      username: 'admin',
      avatarUrl: '/api/auth/profile/avatar?ts=1',
    };
    getWorkspaceUserProfileMock.mockResolvedValue(profile);

    const result = await providerHandlers.get?.();

    expect(getWorkspaceUserProfileMock).toHaveBeenCalledWith('admin-1');
    expect(result).toEqual({ success: true, data: profile });
  });

  it('uploads avatar bytes for the local admin user', async () => {
    const profile = { userId: 'admin-1', username: 'admin', avatarUrl: '/api/auth/profile/avatar?ts=2' };
    updateUserAvatarMock.mockResolvedValue(profile);

    const result = await providerHandlers.uploadAvatar?.({
      mimeType: 'image/png',
      data: new Uint8Array([1, 2, 3]),
    });

    expect(updateUserAvatarMock).toHaveBeenCalledWith({
      userId: 'admin-1',
      buffer: expect.any(Buffer),
      mimeType: 'image/png',
    });
    expect(result).toEqual({ success: true, data: profile });
  });

  it('uploads avatar when IPC serializes Uint8Array as numeric-key object', async () => {
    const profile = { userId: 'admin-1', username: 'admin', avatarUrl: '/api/auth/profile/avatar?ts=3' };
    updateUserAvatarMock.mockResolvedValue(profile);

    const result = await providerHandlers.uploadAvatar?.({
      mimeType: 'image/jpeg',
      data: { 0: 255, 1: 216, 2: 255 } as unknown as Uint8Array,
    });

    expect(updateUserAvatarMock).toHaveBeenCalledWith({
      userId: 'admin-1',
      buffer: Buffer.from([255, 216, 255]),
      mimeType: 'image/jpeg',
    });
    expect(result).toEqual({ success: true, data: profile });
  });

  it('reads avatar bytes from disk', async () => {
    resolveUserAvatarFileMock.mockResolvedValue({
      filePath: '/tmp/avatar.png',
      mime: 'image/png',
    });
    readFileMock.mockResolvedValue(Buffer.from([9, 8, 7]));

    const result = await providerHandlers.readAvatarBuffer?.();

    expect(readFileMock).toHaveBeenCalledWith('/tmp/avatar.png');
    expect(result).toEqual({
      success: true,
      data: {
        mimeType: 'image/png',
        base64: Buffer.from([9, 8, 7]).toString('base64'),
      },
    });
  });
});
