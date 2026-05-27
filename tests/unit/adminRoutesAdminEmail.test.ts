import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockValidateToken, mockGetSystemUser, mockSetAdminEmail } = vi.hoisted(() => ({
  mockValidateToken: vi.fn(() => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  mockGetSystemUser: vi.fn(),
  mockSetAdminEmail: vi.fn(),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findByUsername: vi.fn(),
    createUserWithRole: vi.fn(),
    updateTenantId: vi.fn(),
    listUsers: vi.fn(),
    setRole: vi.fn(),
    updatePassword: vi.fn(),
    deleteUser: vi.fn(),
    findById: vi.fn(),
    getSystemUser: mockGetSystemUser,
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    hashPassword: vi.fn(),
  },
}));

vi.mock('@process/bridge/services/WebuiService', () => ({
  WebuiService: {
    setAdminEmail: mockSetAdminEmail,
    requestResetPasswordEmailCode: vi.fn(),
    resetUserPasswordWithEmailCode: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {},
}));

vi.mock('@process/webserver/auth/repository/AuthIdentityRepository', () => ({
  AuthIdentityRepository: {},
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenMiddleware: {
    validateToken: mockValidateToken,
  },
}));

const passThroughMiddleware = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

vi.mock('@process/webserver/middleware/rateLimiter', () => ({
  apiRateLimiter: passThroughMiddleware,
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('@process/webserver/auth/providers/LdapAuthProvider', () => ({
  testLdapConnection: vi.fn(),
}));

vi.mock('@process/webserver/auth/ldapDirectorySearch', () => ({
  resolveLocalUserForLdapEntry: vi.fn(),
  searchLdapDirectoryForAdmin: vi.fn(),
}));

vi.mock('@process/webserver/auth/providers/FeishuAuthProvider', () => ({
  testFeishuAppCredentials: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/smtpConfig', () => ({
  resolvedSmtpFromConfig: vi.fn(),
}));

vi.mock('@process/webserver/auth/enterpriseRoles', () => ({
  isEnterpriseAdminRole: () => true,
}));

vi.mock('@process/webserver/auth/enterpriseJoinService', () => ({
  EnterpriseJoinError: class EnterpriseJoinError extends Error {},
  createEnterpriseInvite: vi.fn(),
  createEnterpriseTenant: vi.fn(),
  listEnterpriseInvites: vi.fn(),
  revokeEnterpriseInvite: vi.fn(),
}));

function getRouteHandler(app: express.Express, method: 'get' | 'put', path: string): express.RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: express.RequestHandler }> } }) =>
      entry.route?.path === path && entry.route?.methods?.[method]
  );

  return layer?.route?.stack?.at(-1)?.handle as express.RequestHandler;
}

function getRouteStack(app: express.Express, method: 'get' | 'put', path: string): Array<{ handle: express.RequestHandler }> {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: express.RequestHandler }> } }) =>
      entry.route?.path === path && entry.route?.methods?.[method]
  );

  return layer?.route?.stack ?? [];
}

describe('registerAdminRoutes admin email endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current admin email for browser mail settings', async () => {
    mockGetSystemUser.mockResolvedValue({
      id: 'system_default_user',
      username: 'admin',
      email: 'admin@example.com',
    });

    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const handler = getRouteHandler(app, 'get', '/api/admin/system/admin-email');
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    await handler({} as express.Request, res, vi.fn());

    expect(mockGetSystemUser).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        email: 'admin@example.com',
      },
    });
  });

  it('persists the admin email through WebuiService for browser clients', async () => {
    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const handler = getRouteHandler(app, 'put', '/api/admin/system/admin-email');
    const req = {
      body: {
        email: 'admin@example.com',
      },
    } as express.Request;
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockSetAdminEmail).toHaveBeenCalledWith('admin@example.com');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('does not register a global enterprise elevation middleware on admin routes', async () => {
    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const stack = getRouteStack(app, 'get', '/api/admin/auth/providers');

    expect(stack).toHaveLength(4);
    expect(stack.map((layer) => layer.handle.name)).not.toContain('requireEnterpriseElevation');
  });
});
