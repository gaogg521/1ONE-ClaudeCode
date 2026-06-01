import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => false),
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/webuiApiBase', () => ({
  fetchWebuiApi: vi.fn(),
  getWebuiApiBaseUrl: vi.fn(),
}));

import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { fetchWebuiApi, getWebuiApiBaseUrl } from '@/renderer/utils/webuiApiBase';
import { formatOAuthAuthorizeError, startOAuthAuthorize } from '@/renderer/utils/oauthAuthorize';

describe('oauthAuthorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isElectronDesktop).mockReturnValue(false);
    vi.stubGlobal('window', {
      location: {
        href: 'http://localhost/',
      },
    });
  });

  it('requests JSON authorize response in browser and follows returned goto URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (key: string) => (key.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({
        success: true,
        data: { goto: 'http://localhost/#/oauth-start' },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await startOAuthAuthorize('/api/auth/feishu/authorize?mode=oauth&redirect=%2Fenterprise%2Fauth');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/feishu/authorize?mode=oauth&redirect=%2Fenterprise%2Fauth&format=json',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        redirect: 'manual',
      })
    );
    expect(result).toEqual({ ok: true });
    expect((globalThis.window as { location: { href: string } }).location.href).toBe(
      'http://localhost/#/oauth-start'
    );
  });

  it('returns backend message when authorize is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: false, message: 'Feishu login is not enabled' }),
      })
    );

    const result = await startOAuthAuthorize('/api/auth/feishu/authorize?mode=oauth');

    expect(result).toEqual({
      ok: false,
      message: 'Feishu login is not enabled',
      code: undefined,
    });
  });

  it('returns backend code when authorize is rejected with code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: false,
          code: 'NOT_ENABLED',
          message: 'Feishu login is configured but not enabled',
        }),
      })
    );

    const result = await startOAuthAuthorize('/api/auth/feishu/authorize?mode=oauth');

    expect(result).toEqual({
      ok: false,
      message: 'Feishu login is configured but not enabled',
      code: 'NOT_ENABLED',
    });
  });

  it('maps legacy not-enabled backend errors to user-facing text', () => {
    const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;
    expect(formatOAuthAuthorizeError('Feishu login is not enabled', t)).toContain('启用');
  });

  it('opens external redirect on desktop when authorize returns JSON goto', async () => {
    vi.mocked(isElectronDesktop).mockReturnValue(true);
    vi.mocked(getWebuiApiBaseUrl).mockResolvedValue('http://127.0.0.1:25809');
    vi.mocked(fetchWebuiApi).mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: (key: string) => (key.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        success: true,
        data: { goto: 'https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=test' },
      }),
    } as Response);

    const result = await startOAuthAuthorize('/api/auth/feishu/authorize?mode=oauth');

    expect(result.ok).toBe(true);
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=test'
    );
  });

  it('opens external redirect on desktop when Location header is exposed on 302', async () => {
    vi.mocked(isElectronDesktop).mockReturnValue(true);
    vi.mocked(getWebuiApiBaseUrl).mockResolvedValue('http://127.0.0.1:25809');
    vi.mocked(fetchWebuiApi).mockResolvedValue({
      status: 302,
      ok: false,
      headers: {
        get: (key: string) => (key.toLowerCase() === 'location' ? 'https://passport.feishu.cn/oauth' : null),
      },
    } as Response);

    const result = await startOAuthAuthorize('/api/auth/feishu/authorize?mode=oauth');

    expect(result.ok).toBe(true);
    expect(openExternalUrl).toHaveBeenCalledWith('https://passport.feishu.cn/oauth');
  });

  it('fails on desktop when 302 has no Location and no JSON goto', async () => {
    vi.mocked(isElectronDesktop).mockReturnValue(true);
    vi.mocked(getWebuiApiBaseUrl).mockResolvedValue('http://127.0.0.1:25809');
    vi.mocked(fetchWebuiApi).mockResolvedValue({
      status: 302,
      ok: false,
      headers: {
        get: (key: string) => {
          const name = key.toLowerCase();
          if (name === 'content-type') return 'text/html';
          if (name === 'location') return null;
          return null;
        },
      },
    } as Response);

    const result = await startOAuthAuthorize('/api/auth/feishu/authorize?mode=oauth');

    expect(result).toEqual({
      ok: false,
      message: 'OAuth authorization failed',
      code: 'missing_redirect_url',
    });
  });
});
