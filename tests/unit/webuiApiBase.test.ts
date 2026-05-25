/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const isElectronDesktopMock = vi.hoisted(() => vi.fn(() => true));
const desktopSessionTokenInvokeMock = vi.hoisted(() => vi.fn());
const captureCsrfTokenFromResponseMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: isElectronDesktopMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    getStatus: { invoke: vi.fn() },
    getDesktopSessionToken: { invoke: desktopSessionTokenInvokeMock },
  },
}));

vi.mock('@process/webserver/middleware/csrfClient', () => ({
  captureCsrfTokenFromResponse: captureCsrfTokenFromResponseMock,
}));

import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';

describe('webuiApiBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isElectronDesktopMock.mockReturnValue(true);
    vi.stubGlobal('window', {
      electronAPI: {
      webuiGetStatus: vi.fn().mockResolvedValue({
        success: true,
        data: { running: true, port: 25809 },
      }),
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'x-csrf-token': 'csrf-token' },
        })
      )
    );
  });

  it('attaches desktop webui bearer token for electron requests', async () => {
    desktopSessionTokenInvokeMock.mockResolvedValue({
      success: true,
      data: { token: 'desktop-session-token' },
    });

    await fetchWebuiApi('/api/admin/skills');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = new Headers((init as RequestInit | undefined)?.headers);

    expect(url).toBe('http://127.0.0.1:25809/api/admin/skills');
    expect((init as RequestInit | undefined)?.credentials).toBe('include');
    expect(headers.get('authorization')).toBe('Bearer desktop-session-token');
    expect(captureCsrfTokenFromResponseMock).toHaveBeenCalledTimes(1);
  });
});
