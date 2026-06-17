import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindByUsername, mockCreateUserWithRole, mockUpdateTenantId, mockHashPassword } = vi.hoisted(() => ({
  mockFindByUsername: vi.fn(),
  mockCreateUserWithRole: vi.fn(),
  mockUpdateTenantId: vi.fn(),
  mockHashPassword: vi.fn(),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findByUsername: mockFindByUsername,
    createUserWithRole: mockCreateUserWithRole,
    updateTenantId: mockUpdateTenantId,
    listUsers: vi.fn(),
    setRole: vi.fn(),
    updatePassword: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    hashPassword: mockHashPassword,
  },
}));

vi.mock('@process/bridge/services/WebuiService', () => ({
  WebuiService: {},
}));

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {},
}));

vi.mock('@process/webserver/auth/repository/AuthIdentityRepository', () => ({
  AuthIdentityRepository: {},
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenMiddleware: {
    validateToken: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
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

function getCreateUserHandler(app: express.Express): express.RequestHandler {
  const layer = app.router.stack.find(
    (entry: {
      route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: express.RequestHandler }> };
    }) => entry.route?.path === '/api/admin/users' && entry.route?.methods?.post
  );

  return layer?.route?.stack?.at(-1)?.handle as express.RequestHandler;
}

describe('registerAdminRoutes /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByUsername.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashed-password');
    mockCreateUserWithRole.mockResolvedValue({
      id: 'user_new',
      username: 'enterprise_walk_user',
      role: 'member',
    });
    mockUpdateTenantId.mockResolvedValue(undefined);
  });

  it('assigns the new user to the current admin tenant after creation', async () => {
    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const handler = getCreateUserHandler(app);
    const req = {
      body: {
        username: 'enterprise_walk_user',
        password: 'WalkUser123!',
        role: 'user',
      },
      user: {
        id: 'admin_1',
        role: 'org_admin',
        tenant_id: 'tenant_adaeed463219',
      },
    } as unknown as express.Request;
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockCreateUserWithRole).toHaveBeenCalledWith('enterprise_walk_user', 'hashed-password', 'member');
    expect(mockUpdateTenantId).toHaveBeenCalledWith('user_new', 'tenant_adaeed463219');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        id: 'user_new',
        username: 'enterprise_walk_user',
        role: 'member',
      },
    });
  });
});
