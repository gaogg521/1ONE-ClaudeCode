import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindByUsername,
  mockFindById,
  mockConstantTimeVerify,
  mockConstantTimeVerifyMissingUser,
  mockGenerateToken,
  mockGetProvider,
  mockListProviders,
  mockGetByExternalId,
  mockAuthenticateWithLdap,
} = vi.hoisted(() => ({
  mockFindByUsername: vi.fn(),
  mockFindById: vi.fn(),
  mockConstantTimeVerify: vi.fn(),
  mockConstantTimeVerifyMissingUser: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockGetProvider: vi.fn(),
  mockListProviders: vi.fn(),
  mockGetByExternalId: vi.fn(),
  mockAuthenticateWithLdap: vi.fn(),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findByUsername: mockFindByUsername,
    findById: mockFindById,
    updateLastLogin: vi.fn(),
    hasUsers: vi.fn(),
    countUsers: vi.fn(),
    createInitialUser: vi.fn(),
    changePassword: vi.fn(),
    usernameExists: vi.fn(),
    getSystemUser: vi.fn(),
    setSystemUserCredentials: vi.fn(),
    createUser: vi.fn(),
    listUsers: vi.fn(),
    updatePassword: vi.fn(),
    updateUsername: vi.fn(),
    updateLastActiveAt: vi.fn(),
    countActiveUsers: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    constantTimeVerify: mockConstantTimeVerify,
    constantTimeVerifyMissingUser: mockConstantTimeVerifyMissingUser,
    generateToken: mockGenerateToken,
    blacklistToken: vi.fn(),
    hashPassword: vi.fn(),
    validatePassword: vi.fn(),
    validatePasswordStrength: vi.fn(() => ({ isValid: true, errors: [] })),
    verifyPassword: vi.fn(),
    invalidateAllTokens: vi.fn(),
    refreshToken: vi.fn(),
    verifyToken: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {
    getProvider: mockGetProvider,
    listProviders: mockListProviders,
  },
}));

vi.mock('@process/webserver/auth/repository/AuthIdentityRepository', () => ({
  AuthIdentityRepository: {
    getByExternalId: mockGetByExternalId,
  },
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: ((_req, _res, next) => next()) as RequestHandler,
    authenticateToken: ((_req, _res, next) => next()) as RequestHandler,
    validateSetupInput: ((_req, _res, next) => next()) as RequestHandler,
    requireSetupMode: ((_req, _res, next) => next()) as RequestHandler,
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: {
    extractFromRequest: vi.fn(),
  },
}));

vi.mock('@process/webserver/middleware/errorHandler', () => ({
  createAppError: vi.fn(),
}));

vi.mock('@process/webserver/middleware/security', () => ({
  authRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
  authenticatedActionLimiter: ((_req, _res, next) => next()) as RequestHandler,
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    COOKIE: {
      NAME: 'auth-token',
    },
    TOKEN: {
      COOKIE_MAX_AGE: 0,
      SESSION_EXPIRY: 3600,
    },
  },
  getCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: vi.fn(),
}));

vi.mock('@process/webserver/auth/providers/LdapAuthProvider', () => ({
  authenticateWithLdap: mockAuthenticateWithLdap,
}));

function getLoginHandler(app: express.Express): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) =>
      entry.route?.path === '/login'
  );

  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

function getRouteHandler(app: express.Express, path: string): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) =>
      entry.route?.path === path
  );

  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

function createResponseMock() {
  const response = {
    cookie: vi.fn(),
    json: vi.fn(),
    status: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return response;
}

describe('registerAuthRoutes login endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 after running the dedicated missing-user verification when the username does not exist', async () => {
    mockFindByUsername.mockResolvedValue(null);
    mockConstantTimeVerifyMissingUser.mockResolvedValue(false);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLoginHandler(app);
    const req = {
      body: {
        username: 'missing-user',
        password: 'wrong-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockFindByUsername).toHaveBeenCalledWith('missing-user');
    expect(mockConstantTimeVerifyMissingUser).toHaveBeenCalledOnce();
    expect(mockConstantTimeVerify).not.toHaveBeenCalled();
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid username or password',
    });
  });

  it('verifies the provided password against the stored hash when the user exists', async () => {
    mockFindByUsername.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      password_hash: '$2a$12$storedhashstoredhashstoredhashstoredhashstoredhashsto',
    });
    mockConstantTimeVerify.mockResolvedValue(false);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLoginHandler(app);
    const req = {
      body: {
        username: 'alice',
        password: 'wrong-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockConstantTimeVerifyMissingUser).not.toHaveBeenCalled();
    expect(mockConstantTimeVerify).toHaveBeenCalledWith(
      'wrong-password',
      '$2a$12$storedhashstoredhashstoredhashstoredhashstoredhashsto',
      true
    );
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
  });

  it('returns normalized enterprise identity metadata after successful local login', async () => {
    mockFindByUsername.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      password_hash: '$2a$12$storedhashstoredhashstoredhashstoredhashstoredhashsto',
      role: 'org_admin',
      tenant_id: 'tenant-acme',
    });
    mockConstantTimeVerify.mockResolvedValue(true);
    mockGenerateToken.mockResolvedValue('jwt-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLoginHandler(app);
    const req = {
      body: {
        username: 'alice',
        password: 'correct-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      message: 'Login successful',
      user: {
        id: 'user-1',
        username: 'alice',
        role: 'org_admin',
        tenant_id: 'tenant-acme',
      },
      token: 'jwt-token',
    });
  });

  it('normalizes legacy admin role in local login response', async () => {
    mockFindByUsername.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      password_hash: '$2a$12$storedhashstoredhashstoredhashstoredhashstoredhashsto',
      role: 'admin',
      tenant_id: 'default',
    });
    mockConstantTimeVerify.mockResolvedValue(true);
    mockGenerateToken.mockResolvedValue('jwt-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLoginHandler(app);
    const req = {
      body: {
        username: 'admin',
        password: 'correct-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          role: 'system_admin',
          tenant_id: 'default',
        }),
      })
    );
  });

  it('returns 403 when LDAP account is not bound to a local user', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'ldap',
      enabled: true,
      config: {
        url: 'ldap://example.com',
        baseDN: 'dc=example,dc=com',
      },
    });
    mockAuthenticateWithLdap.mockResolvedValue({
      externalId: 'uid=bob,ou=users,dc=example,dc=com',
      isAdmin: false,
      userDn: 'uid=bob,ou=users,dc=example,dc=com',
    });
    mockGetByExternalId.mockResolvedValue(null);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRouteHandler(app, '/api/auth/ldap/login');
    const req = {
      body: {
        username: 'bob',
        password: 'correct-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(403);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      message: 'Account not bound. Please contact admin.',
    });
  });

  it('returns normalized enterprise identity metadata after successful LDAP login', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'ldap',
      enabled: true,
      config: {
        url: 'ldap://example.com',
        baseDN: 'dc=example,dc=com',
      },
    });
    mockAuthenticateWithLdap.mockResolvedValue({
      externalId: 'uid=alice,ou=users,dc=example,dc=com',
      isAdmin: true,
      userDn: 'uid=alice,ou=users,dc=example,dc=com',
    });
    mockGetByExternalId.mockResolvedValue({
      user_id: 'user-ldap-1',
    });
    mockFindById.mockResolvedValue({
      id: 'user-ldap-1',
      username: 'alice',
      role: 'member',
      tenant_id: 'tenant-acme',
    });
    mockGenerateToken.mockResolvedValue('ldap-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRouteHandler(app, '/api/auth/ldap/login');
    const req = {
      body: {
        username: 'alice',
        password: 'correct-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockAuthenticateWithLdap).toHaveBeenCalledWith('alice', 'correct-password', {
      url: 'ldap://example.com',
      baseDN: 'dc=example,dc=com',
    });
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      message: 'Login successful',
      user: {
        id: 'user-ldap-1',
        username: 'alice',
        role: 'system_admin',
        tenant_id: 'tenant-acme',
      },
      token: 'ldap-token',
    });
  });

  it('returns 401 when LDAP user is not found by directory filter', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'ldap',
      enabled: true,
      config: {
        url: 'ldap://example.com',
        baseDN: 'dc=example,dc=com',
      },
    });
    mockAuthenticateWithLdap.mockRejectedValue(new Error('User not found'));

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRouteHandler(app, '/api/auth/ldap/login');
    const req = {
      body: {
        username: 'alice@example.com',
        password: 'correct-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid username or password',
    });
  });

  it('returns 503 when LDAP upstream times out', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'ldap',
      enabled: true,
      config: {
        url: 'ldap://example.com',
        baseDN: 'dc=example,dc=com',
      },
    });
    const timeoutError = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    mockAuthenticateWithLdap.mockRejectedValue(timeoutError);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRouteHandler(app, '/api/auth/ldap/login');
    const req = {
      body: {
        username: 'alice',
        password: 'correct-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(503);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      message: 'LDAP service unavailable. Please retry later.',
    });
  });
});

describe('registerAuthRoutes /api/auth/login-ui', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports enterprise mode when LDAP or Feishu is enabled', async () => {
    mockListProviders.mockResolvedValue([
      { provider: 'ldap', enabled: true, hasConfig: true },
      { provider: 'feishu', enabled: false, hasConfig: true },
    ]);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRouteHandler(app, '/api/auth/login-ui');
    const res = createResponseMock() as unknown as express.Response;

    await handler({} as express.Request, res, vi.fn());

    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      data: {
        mode: 'enterprise',
        ldapEnabled: true,
        feishuEnabled: false,
        dingtalkEnabled: false,
        wecomEnabled: false,
        ldapConfigured: true,
        feishuConfigured: true,
        dingtalkConfigured: false,
        wecomConfigured: false,
      },
    });
  });

  it('reports standalone mode when no enterprise providers are enabled', async () => {
    mockListProviders.mockResolvedValue([]);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRouteHandler(app, '/api/auth/login-ui');
    const res = createResponseMock() as unknown as express.Response;

    await handler({} as express.Request, res, vi.fn());

    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      data: {
        mode: 'standalone',
        ldapEnabled: false,
        feishuEnabled: false,
        dingtalkEnabled: false,
        wecomEnabled: false,
        ldapConfigured: false,
        feishuConfigured: false,
        dingtalkConfigured: false,
        wecomConfigured: false,
      },
    });
  });
});
