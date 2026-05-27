import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorkspaceUserProfileMock = vi.hoisted(() => vi.fn());
const resolveUserAvatarFileMock = vi.hoisted(() => vi.fn());
const updateUserAvatarMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock('@process/services/user/userProfileService', () => ({
  getWorkspaceUserProfile: (...args: unknown[]) => getWorkspaceUserProfileMock(...args),
  resolveUserAvatarFile: (...args: unknown[]) => resolveUserAvatarFileMock(...args),
  updateUserAvatar: (...args: unknown[]) => updateUserAvatarMock(...args),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => readFileMock(...args),
  },
}));

function createResponseMock() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
    end: vi.fn(),
  } as any;
  res.status.mockReturnValue(res);
  return res;
}

function getRouteHandler(app: express.Express, method: string, path: string): RequestHandler {
  const layer = app.router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods[method]
  );
  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

describe('profileRoutes', () => {
  let app: express.Express;
  const auth: RequestHandler = (req, _res, next) => {
    req.user = { id: 'user-1', tenant_id: 'tenant-1', role: 'member' };
    next();
  };
  const rateLimit: RequestHandler = (_req, _res, next) => next();

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { registerProfileRoutes } = await import('@process/webserver/routes/profileRoutes');
    registerProfileRoutes(app, { rateLimit, auth });
  });

  it('returns workspace profile for authenticated user', async () => {
    const profile = {
      userId: 'user-1',
      username: 'alice',
      joinedEnterprise: true,
      tenantName: 'Acme',
      teams: [],
    };
    getWorkspaceUserProfileMock.mockResolvedValueOnce(profile);
    const handler = getRouteHandler(app, 'get', '/api/auth/workspace-profile');
    const res = createResponseMock();

    await handler({ user: { id: 'user-1' } } as any, res);

    expect(getWorkspaceUserProfileMock).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: profile });
  });

  it('returns 404 when workspace profile is missing', async () => {
    getWorkspaceUserProfileMock.mockResolvedValueOnce(null);
    const handler = getRouteHandler(app, 'get', '/api/auth/workspace-profile');
    const res = createResponseMock();

    await handler({ user: { id: 'user-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'User not found' });
  });

  it('streams avatar bytes when avatar file exists', async () => {
    resolveUserAvatarFileMock.mockResolvedValueOnce({
      filePath: '/tmp/user-1.png',
      mime: 'image/png',
    });
    readFileMock.mockResolvedValueOnce(Buffer.from('png-bytes'));
    const handler = getRouteHandler(app, 'get', '/api/auth/profile/avatar');
    const res = createResponseMock();

    await handler({ user: { id: 'user-1' } } as any, res);

    expect(resolveUserAvatarFileMock).toHaveBeenCalledWith('user-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('png-bytes'));
  });

  it('updates avatar and returns refreshed profile', async () => {
    const profile = { userId: 'user-1', username: 'alice', avatarUrl: '/api/auth/profile/avatar?ts=1' };
    updateUserAvatarMock.mockResolvedValueOnce(profile);
    const handler = getRouteHandler(app, 'post', '/api/auth/profile/avatar');
    const res = createResponseMock();

    await handler(
      {
        user: { id: 'user-1' },
        file: { buffer: Buffer.from('avatar'), mimetype: 'image/png' },
      } as any,
      res
    );

    expect(updateUserAvatarMock).toHaveBeenCalledWith({
      userId: 'user-1',
      buffer: expect.any(Buffer),
      mimeType: 'image/png',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: profile });
  });

  it('rejects avatar upload without file', async () => {
    const handler = getRouteHandler(app, 'post', '/api/auth/profile/avatar');
    const res = createResponseMock();

    await handler({ user: { id: 'user-1' }, file: undefined } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Avatar file is required' });
  });
});
