/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const dispatchMock = vi.hoisted(() => vi.fn());
const isDesktopMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/renderer/utils/syncBrowserWebuiSession', () => ({
  syncBrowserWebuiSessionToDesktop: syncMock,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: isDesktopMock,
}));

vi.mock('@/renderer/utils/webuiConfigSync', () => ({
  dispatchWebuiConfigRefresh: dispatchMock,
}));

import { resetOrgConfigChangedDedupForTests, handleOrgConfigChanged } from '@/renderer/utils/handleOrgConfigChanged';

describe('handleOrgConfigChanged', () => {
  beforeEach(() => {
    resetOrgConfigChangedDedupForTests();
    syncMock.mockClear();
    dispatchMock.mockClear();
    isDesktopMock.mockReturnValue(false);
  });

  it('dispatches config refresh for login channel changes', async () => {
    await handleOrgConfigChanged({
      scope: 'login-channels',
      tenantId: 'tenant-a',
      provider: 'dingtalk',
      updatedAt: Date.now(),
      revision: 'rev-1',
    });

    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches config refresh for auth provider changes', async () => {
    await handleOrgConfigChanged({
      scope: 'auth-providers',
      tenantId: 'tenant-a',
      provider: 'feishu',
      updatedAt: Date.now(),
      revision: 'rev-1',
    });

    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates identical revisions', async () => {
    const payload = {
      scope: 'auth-providers' as const,
      tenantId: 'tenant-a',
      updatedAt: Date.now(),
      revision: 'rev-dup',
    };
    await handleOrgConfigChanged(payload);
    await handleOrgConfigChanged(payload);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('syncs browser session on desktop before refresh', async () => {
    isDesktopMock.mockReturnValue(true);
    await handleOrgConfigChanged({
      scope: 'admin-email',
      tenantId: 'tenant-a',
      updatedAt: Date.now(),
      revision: 'rev-2',
    });
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });
});
