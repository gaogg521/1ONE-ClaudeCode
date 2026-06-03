/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const isElectronDesktopMock = vi.hoisted(() => vi.fn(() => true));
const syncInvokeMock = vi.hoisted(() => vi.fn());
const captureCsrfTokenFromResponseMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: isElectronDesktopMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    getStatus: { invoke: vi.fn() },
    syncBrowserWebuiSession: { invoke: syncInvokeMock },
  },
}));

vi.mock('@/renderer/utils/syncBrowserWebuiSession', () => ({
  getDesktopWebuiBearerToken: vi.fn(() => 'browser-synced-token'),
}));

vi.mock('@process/webserver/middleware/csrfClient', () => ({
  captureCsrfTokenFromResponse: captureCsrfTokenFromResponseMock,
  getCsrfToken: vi.fn(() => null),
  withCsrfHeader: (headers: HeadersInit | undefined) => headers,
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
          data: {
            running: true,
            port: 25809,
            localUrl: 'http://localhost:25809',
            networkUrl: 'http://172.29.128.120:25809',
            lanIP: '172.29.128.120',
          },
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

  it('attaches browser-synced bearer and desktop client header for electron requests', async () => {
    await fetchWebuiApi('/api/admin/skills');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = new Headers((init as RequestInit | undefined)?.headers);

    expect(url).toBe('http://localhost:25809/api/admin/skills');
    expect((init as RequestInit | undefined)?.credentials).toBe('include');
    expect(headers.get('authorization')).toBe('Bearer browser-synced-token');
    expect(headers.get('x-one-client')).toBe('electron-desktop');
    expect(captureCsrfTokenFromResponseMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to LAN origin when loopback fetch fails', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'x-csrf-token': 'csrf-token' },
        })
      );

    await fetchWebuiApi('/api/admin/skills');

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://localhost:25809/api/admin/skills');
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('http://127.0.0.1:25809/api/admin/skills');
    expect(vi.mocked(fetch).mock.calls[2]?.[0]).toBe('http://172.29.128.120:25809/api/admin/skills');
  });
});
