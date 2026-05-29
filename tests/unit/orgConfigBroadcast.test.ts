/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const emitMock = vi.hoisted(() => vi.fn());

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    orgConfigChanged: { emit: emitMock },
  },
}));

import { publishOrgConfigChanged, publishLoginChannelsChanged } from '@/process/webserver/orgConfigBroadcast';

describe('publishOrgConfigChanged', () => {
  it('emits org config changed payload with revision', () => {
    emitMock.mockClear();
    const payload = publishOrgConfigChanged({
      scope: 'login-channels',
      tenantId: 'tenant-x',
      provider: 'ldap',
    });
    expect(payload.scope).toBe('login-channels');
    expect(payload.provider).toBe('ldap');
    expect(payload.revision).toBeTruthy();
    expect(emitMock).toHaveBeenCalledWith(payload);
  });

  it('publishLoginChannelsChanged uses login-channels scope', () => {
    emitMock.mockClear();
    const payload = publishLoginChannelsChanged({ tenantId: 't1', provider: 'wecom' });
    expect(payload.scope).toBe('login-channels');
    expect(payload.provider).toBe('wecom');
  });
});
