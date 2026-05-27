import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listUserNotificationsMock = vi.fn();
const getUnreadNotificationCountMock = vi.fn();
const markNotificationReadMock = vi.fn();
const markAllNotificationsReadMock = vi.fn();

vi.mock('@process/services/devops/userNotificationService', () => ({
  listUserNotifications: (...args: unknown[]) => listUserNotificationsMock(...args),
  getUnreadNotificationCount: (...args: unknown[]) => getUnreadNotificationCountMock(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationReadMock(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsReadMock(...args),
}));

function createResponseMock() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  } as {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
  res.status.mockReturnValue(res);
  return res;
}

function getRouteHandler(app: express.Express, method: string, path: string): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: RequestHandler }> } }) =>
      entry.route?.path === path && entry.route?.methods?.[method]
  );
  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

describe('notificationRoutes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { registerNotificationRoutes } = await import('@process/webserver/routes/notificationRoutes');
    registerNotificationRoutes(app, {
      rateLimit: ((_req, _res, next) => next()) as RequestHandler,
      auth: ((req, _res, next) => {
        req.user = { id: 'user-1', tenant_id: 'tenant-1', role: 'member' };
        next();
      }) as RequestHandler,
    });
  });

  it('GET /api/notifications returns list', async () => {
    listUserNotificationsMock.mockResolvedValueOnce([{ id: 'n-1', title: 'Hello' }]);
    const handler = getRouteHandler(app, 'get', '/api/notifications');
    const req = { user: { id: 'user-1', tenant_id: 'tenant-1' }, query: { limit: '10' } } as express.Request;
    const res = createResponseMock();

    await handler(req, res, () => {});

    expect(listUserNotificationsMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      limit: 10,
      unreadOnly: false,
    });
    expect(res.json).toHaveBeenCalledWith([{ id: 'n-1', title: 'Hello' }]);
  });

  it('GET /api/notifications/unread-count returns count', async () => {
    getUnreadNotificationCountMock.mockResolvedValueOnce(5);
    const handler = getRouteHandler(app, 'get', '/api/notifications/unread-count');
    const req = { user: { id: 'user-1', tenant_id: 'tenant-1' } } as express.Request;
    const res = createResponseMock();

    await handler(req, res, () => {});

    expect(getUnreadNotificationCountMock).toHaveBeenCalledWith('tenant-1', 'user-1');
    expect(res.json).toHaveBeenCalledWith({ count: 5 });
  });

  it('PATCH /api/notifications/:id/read marks notification read', async () => {
    markNotificationReadMock.mockResolvedValueOnce(true);
    const handler = getRouteHandler(app, 'patch', '/api/notifications/:id/read');
    const req = { user: { id: 'user-1' }, params: { id: 'n-1' } } as express.Request;
    const res = createResponseMock();

    await handler(req, res, () => {});

    expect(markNotificationReadMock).toHaveBeenCalledWith('n-1', 'user-1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('POST /api/notifications/read-all marks all read', async () => {
    markAllNotificationsReadMock.mockResolvedValueOnce(2);
    const handler = getRouteHandler(app, 'post', '/api/notifications/read-all');
    const req = { user: { id: 'user-1', tenant_id: 'tenant-1' } } as express.Request;
    const res = createResponseMock();

    await handler(req, res, () => {});

    expect(markAllNotificationsReadMock).toHaveBeenCalledWith('tenant-1', 'user-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, updated: 2 });
  });
});
