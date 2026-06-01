import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.stubGlobal('fetch', fetchMock);

import { exchangeFeishuCodeForUserAccessToken } from '@process/webserver/auth/providers/FeishuAuthProvider';

describe('FeishuAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts access_token returned at the top level', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        access_token: 'user-token',
      }),
    });

    await expect(
      exchangeFeishuCodeForUserAccessToken({
        appId: 'cli_test',
        appSecret: 'secret',
        code: 'oauth-code',
        redirectUri: 'http://127.0.0.1:25809/api/auth/feishu/callback',
      })
    ).resolves.toBe('user-token');
  });
});
