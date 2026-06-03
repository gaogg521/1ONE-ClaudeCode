/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { ONE_WEBUI_CLIENT_DESKTOP, ONE_WEBUI_CLIENT_HEADER } from '@/common/config/webuiClientHeaders';

const resolveLanIpMock = vi.hoisted(() => vi.fn(() => '172.29.128.120'));

vi.mock('@/common/utils/resolveLanIp', () => ({
  resolveLanIp: resolveLanIpMock,
}));

import { canUseAnonymousLocalDevops } from '@/common/config/localDevopsAccess';

describe('canUseAnonymousLocalDevops', () => {
  it('allows loopback requests with localhost Host', () => {
    expect(
      canUseAnonymousLocalDevops({
        ip: '127.0.0.1',
        headers: { host: 'localhost:25809' },
        socket: { remoteAddress: '127.0.0.1' },
      })
    ).toBe(true);
  });

  it('allows desktop client hitting the machine LAN Host from loopback', () => {
    expect(
      canUseAnonymousLocalDevops({
        ip: '127.0.0.1',
        headers: {
          host: '172.29.128.120:25809',
          [ONE_WEBUI_CLIENT_HEADER]: ONE_WEBUI_CLIENT_DESKTOP,
        },
        socket: { remoteAddress: '127.0.0.1' },
      })
    ).toBe(true);
  });

  it('rejects LAN Host without desktop client header', () => {
    expect(
      canUseAnonymousLocalDevops({
        ip: '127.0.0.1',
        headers: { host: '172.29.128.120:25809' },
        socket: { remoteAddress: '127.0.0.1' },
      })
    ).toBe(false);
  });
});
