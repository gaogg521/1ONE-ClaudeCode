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

  it('opens external redirect on desktop', async () => {
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
});
