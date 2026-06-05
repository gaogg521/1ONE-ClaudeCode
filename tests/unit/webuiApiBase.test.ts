/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const isElectronDesktopMock = vi.hoisted(() => vi.fn(() => true));
const syncInvokeMock = vi.hoisted(() => vi.fn());
const captureCsrfTokenFromResponseMock = vi.hoisted(() => vi.fn());
const invokeLoopbackRequestMock = vi.hoisted(() => vi.fn());
const getCsrfTokenMock = vi.hoisted(() => vi.fn(() => null as string | null));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: isElectronDesktopMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    getStatus: { invoke: vi.fn() },
    syncBrowserWebuiSession: { invoke: syncInvokeMock },
    invokeLoopbackRequest: { invoke: invokeLoopbackRequestMock },
  },
}));

vi.mock('@/renderer/utils/syncBrowserWebuiSession', () => ({
  getDesktopWebuiBearerToken: vi.fn(() => 'browser-synced-token'),
}));

vi.mock('@/renderer/utils/rememberEnterpriseApiOrigin', () => ({
  readEnterpriseApiOrigins: vi.fn(async () => [
    'http://localhost:25809',
    'http://127.0.0.1:25809',
    'http://172.29.128.120:25809',
  ]),
  rememberEnterpriseApiOrigin: vi.fn(async () => undefined),
}));

vi.mock('@process/webserver/middleware/csrfClient', () => ({
  captureCsrfTokenFromResponse: captureCsrfTokenFromResponseMock,
  getCsrfToken: getCsrfTokenMock,
  withCsrfHeader: (headers: HeadersInit | undefined) => headers,
}));

import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';

describe('webuiApiBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isElectronDesktopMock.mockReturnValue(true);
    invokeLoopbackRequestMock.mockResolvedValue({
      success: true,
      data: {
        ok: true,
        status: 200,
        headers: { 'x-csrf-token': 'csrf-token' },
        bodyText: JSON.stringify({ success: true }),
      },
    });
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

  it('uses main-process loopback IPC when local WebUI is running on desktop', async () => {
    const response = await fetchWebuiApi('/api/admin/skills');

    expect(invokeLoopbackRequestMock).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(response.ok).toBe(true);
    expect(invokeLoopbackRequestMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/api/admin/skills',
      method: 'GET',
      headers: expect.objectContaining({
        authorization: 'Bearer browser-synced-token',
        'x-one-client': 'electron-desktop',
      }),
    });
    expect(captureCsrfTokenFromResponseMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to renderer fetch when local WebUI is not running', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        webuiGetStatus: vi.fn().mockResolvedValue({
          success: true,
          data: { running: false, port: 25809 },
        }),
      },
    });

    await fetchWebuiApi('/api/admin/skills');

    expect(invokeLoopbackRequestMock).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://localhost:25809/api/admin/skills');
  });

  it('prefetches CSRF via loopback before desktop mutations', async () => {
    captureCsrfTokenFromResponseMock.mockImplementation(() => {
      getCsrfTokenMock.mockReturnValue('csrf-token');
    });
    invokeLoopbackRequestMock
      .mockResolvedValueOnce({
        success: true,
        data: {
          ok: true,
          status: 200,
          headers: { 'x-csrf-token': 'csrf-token' },
          bodyText: JSON.stringify({ success: true }),
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          ok: true,
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ success: true, data: { id: 'issue-1' } }),
        },
      });

    await fetchWebuiApi('/api/admin/requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'story', subject: 'P0' }),
    });

    expect(invokeLoopbackRequestMock).toHaveBeenCalledTimes(2);
    expect(invokeLoopbackRequestMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/api/auth/login-ui',
      method: 'GET',
    });
    expect(invokeLoopbackRequestMock.mock.calls[1]?.[0]).toMatchObject({
      path: '/api/admin/requirements',
      method: 'POST',
    });
  });
});
