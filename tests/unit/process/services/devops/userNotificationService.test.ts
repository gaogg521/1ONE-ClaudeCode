import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUserNotification,
  getUnreadNotificationCount,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@process/services/devops/userNotificationService';

const mockRun = vi.fn(() => ({ changes: 1 }));
const mockAll = vi.fn();
const mockGet = vi.fn();

const mockDriver = {
  prepare: vi.fn(() => ({
    run: mockRun,
    all: mockAll,
    get: mockGet,
  })),
};

vi.mock('@process/services/database', () => ({
  getDatabase: async () => ({
    getDriver: () => mockDriver,
  }),
}));

describe('userNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createUserNotification inserts row and returns record', async () => {
    const record = await createUserNotification({
      tenantId: 'tenant-1',
      userId: 'user-1',
      kind: 'issue_comment',
      title: 'Issue update',
      body: 'Hello @alice',
      linkPath: '/super-assistant?issueId=req-1',
      metadata: { requirementId: 'req-1' },
    });

    expect(record.tenant_id).toBe('tenant-1');
    expect(record.user_id).toBe('user-1');
    expect(record.kind).toBe('issue_comment');
    expect(record.link_path).toBe('/super-assistant?issueId=req-1');
    expect(record.read_at).toBeNull();
    expect(mockRun).toHaveBeenCalled();
  });

  it('listUserNotifications maps rows', async () => {
    mockAll.mockReturnValueOnce([
      {
        id: 'n-1',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        kind: 'lead_alert',
        title: 'Blocker',
        body: 'Agent blocked',
        link_path: '/super-assistant?issueId=req-1',
        metadata: '{"requirementId":"req-1"}',
        read_at: null,
        created_at: 100,
      },
    ]);

    const items = await listUserNotifications({ tenantId: 'tenant-1', userId: 'user-1' });
    expect(items).toHaveLength(1);
    expect(items[0]?.metadata).toEqual({ requirementId: 'req-1' });
  });

  it('getUnreadNotificationCount returns count', async () => {
    mockGet.mockReturnValueOnce({ count: 3 });
    await expect(getUnreadNotificationCount('tenant-1', 'user-1')).resolves.toBe(3);
  });

  it('markNotificationRead updates unread row', async () => {
    mockRun.mockReturnValueOnce({ changes: 1 });
    await expect(markNotificationRead('n-1', 'user-1')).resolves.toBe(true);
  });

  it('markAllNotificationsRead returns updated count', async () => {
    mockRun.mockReturnValueOnce({ changes: 2 });
    await expect(markAllNotificationsRead('tenant-1', 'user-1')).resolves.toBe(2);
  });
});
