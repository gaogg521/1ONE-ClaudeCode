import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.stubGlobal('fetch', fetchMock);

import { fetchFeishuOrgUnitPath } from '@process/webserver/auth/orgProfile/feishuOrgProfile';

describe('feishuOrgProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds department path from contact APIs', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { tenant_access_token: 'tenant-token' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { user: { department_ids: ['dept-leaf'] } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { department: { name: '平台组', parent_department_id: 'dept-root' } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { department: { name: '研发中心', parent_department_id: '0' } },
        }),
      });

    const path = await fetchFeishuOrgUnitPath({
      appId: 'app-id',
      appSecret: 'app-secret',
      openId: 'ou_123',
    });

    expect(path).toBe('研发中心 / 平台组');
  });

  it('returns null when user has no departments', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { tenant_access_token: 'tenant-token' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: { user: { department_ids: [] } },
        }),
      });

    const path = await fetchFeishuOrgUnitPath({
      appId: 'app-id',
      appSecret: 'app-secret',
      openId: 'ou_123',
    });

    expect(path).toBeNull();
  });
});
