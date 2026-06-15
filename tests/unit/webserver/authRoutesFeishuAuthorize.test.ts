import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetProvider,
  mockGetByExternalId,
  mockFindById,
  mockGenerateToken,
  mockExchangeFeishuCodeForUserAccessToken,
  mockFetchFeishuUserInfo,
  mockResolveFeishuExternalId,
  mockExchangeDingTalkCodeForUserAccessToken,
  mockFetchDingTalkUserInfo,
  mockResolveDingTalkExternalId,
  mockFetchWeComCorpAccessToken,
  mockFetchWeComUserIdByOAuthCode,
  mockHasUsers,
  mockCountUsers,
  mockValidateLoginInput,
  mockAuthenticateToken,
  mockVerifyQRTokenDirect,
  mockCreateAppError,
} = vi.hoisted(() => ({
  mockGetProvider: vi.fn(),
  mockGetByExternalId: vi.fn(),
  mockFindById: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockExchangeFeishuCodeForUserAccessToken: vi.fn(),
  mockFetchFeishuUserInfo: vi.fn(),
  mockResolveFeishuExternalId: vi.fn(),
  mockExchangeDingTalkCodeForUserAccessToken: vi.fn(),
  mockFetchDingTalkUserInfo: vi.fn(),
  mockResolveDingTalkExternalId: vi.fn(),
  mockFetchWeComCorpAccessToken: vi.fn(),
  mockFetchWeComUserIdByOAuthCode: vi.fn(),
  mockHasUsers: vi.fn(),
  mockCountUsers: vi.fn(),
  mockValidateLoginInput: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  mockAuthenticateToken: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  mockVerifyQRTokenDirect: vi.fn(),
  mockCreateAppError: vi.fn((message: string, status: number) => ({ message, status })),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    hasUsers: mockHasUsers,
    countUsers: mockCountUsers,
    findByUsername: vi.fn(),
    updateLastLogin: vi.fn(),
    findById: mockFindById,
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

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {
    getProvider: mockGetProvider,
    setProvider: vi.fn(),
    listProviders: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/repository/AuthIdentityRepository', () => ({
  AuthIdentityRepository: {
    getByExternalId: mockGetByExternalId,
    getByUser: vi.fn(),
    listForUsers: vi.fn(),
    bind: vi.fn(),
    unbind: vi.fn(),
    unbindUser: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    constantTimeVerify: vi.fn(),
    constantTimeVerifyMissingUser: vi.fn(),
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

vi.mock('@process/webserver/auth/providers/FeishuAuthProvider', () => ({
  buildFeishuAuthorizeUrl: vi.fn(({ appId, redirectUri, state }) => {
    const url = new URL('https://passport.feishu.cn/suite/passport/oauth/authorize');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return url.toString();
  }),
  exchangeFeishuCodeForUserAccessToken: mockExchangeFeishuCodeForUserAccessToken,
  fetchFeishuUserInfo: mockFetchFeishuUserInfo,
  resolveFeishuExternalId: mockResolveFeishuExternalId,
}));

vi.mock('@process/webserver/auth/providers/DingTalkAuthProvider', () => ({
  buildDingTalkAuthorizeUrl: vi.fn(({ appKey, redirectUri, state }) => {
    const url = new URL('https://login.dingtalk.com/oauth2/auth');
    url.searchParams.set('client_id', appKey);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return url.toString();
  }),
  exchangeDingTalkCodeForUserAccessToken: mockExchangeDingTalkCodeForUserAccessToken,
  fetchDingTalkUserInfo: mockFetchDingTalkUserInfo,
  resolveDingTalkExternalId: mockResolveDingTalkExternalId,
}));

vi.mock('@process/webserver/auth/providers/WeComAuthProvider', () => ({
  buildWeComAuthorizeUrl: vi.fn(({ corpId, agentId, redirectUri, state }) => {
    const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize');
    url.searchParams.set('appid', corpId);
    url.searchParams.set('agentid', agentId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return `${url.toString()}#wechat_redirect`;
  }),
  fetchWeComCorpAccessToken: mockFetchWeComCorpAccessToken,
  fetchWeComUserIdByOAuthCode: mockFetchWeComUserIdByOAuthCode,
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: mockValidateLoginInput,
    authenticateToken: mockAuthenticateToken,
    validateSetupInput: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
    requireSetupMode: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: {
    extractFromRequest: vi.fn(),
  },
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: mockVerifyQRTokenDirect,
}));

vi.mock('@process/webserver/middleware/errorHandler', () => ({
  createAppError: mockCreateAppError,
}));

const passThroughMiddleware = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

vi.mock('@process/webserver/middleware/security', () => ({
  authRateLimiter: passThroughMiddleware,
  authenticatedActionLimiter: passThroughMiddleware,
  apiRateLimiter: passThroughMiddleware,
}));

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    COOKIE: { NAME: 'auth' },
    TOKEN: { COOKIE_MAX_AGE: 3600000 },
  },
  getCookieOptions: vi.fn(() => ({})),
}));

function getFeishuAuthorizeHandler(app: express.Express): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) =>
      entry.route?.path === '/api/auth/feishu/authorize'
  );

  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

function getRouteHandler(app: express.Express, path: string): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) => entry.route?.path === path
  );

  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

function hasRoute(app: express.Express, method: string, path: string): boolean {
  return app.router.stack.some(
    (entry: {
      route?: {
        path?: string;
        methods?: Record<string, boolean>;
      };
    }) => entry.route?.path === path && Boolean(entry.route?.methods?.[method])
  );
}

function createResponseMock() {
  const response = {
    cookie: vi.fn(),
    json: vi.fn(),
    redirect: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return response;
}

describe('registerAuthRoutes /api/auth/feishu/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasUsers.mockResolvedValue(true);
    mockCountUsers.mockResolvedValue(1);
  });

  it('redirects to Feishu OAuth using the configured callback URL instead of localhost', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'feishu',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        appId: 'cli_a90abd387f395bca',
        appSecret: 'secret',
        redirectUri: 'http://192.168.11.159:25809/api/auth/feishu/callback',
        externalIdField: 'union_id',
      },
    });

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getFeishuAuthorizeHandler(app);
    const req = {
      query: { mode: 'oauth' },
      headers: {},
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockGetProvider).toHaveBeenCalledWith('feishu');
    expect((res as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect).toHaveBeenCalledOnce();

    const redirectLocation = (res as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect.mock
      .calls[0][0] as string;
    const authorizeUrl = new URL(redirectLocation);

    expect(authorizeUrl.origin).toBe('https://passport.feishu.cn');
    expect(authorizeUrl.searchParams.get('client_id')).toBe('cli_a90abd387f395bca');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe('http://192.168.11.159:25809/api/auth/feishu/callback');
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
    expect(authorizeUrl.searchParams.get('redirect_uri')).not.toContain('localhost');
  });

  it('does not register legacy enterprise elevation auth endpoints', async () => {
    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    expect(hasRoute(app, 'get', '/api/auth/enterprise-elevation')).toBe(false);
    expect(hasRoute(app, 'post', '/api/auth/enterprise-elevate')).toBe(false);
    expect(hasRoute(app, 'post', '/api/auth/enterprise-elevate/revoke')).toBe(false);
  });

  it('returns NOT_CONFIGURED when redirect URI cannot be resolved', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'feishu',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        appId: 'cli_a90abd387f395bca',
        appSecret: 'secret',
        redirectUri: '',
      },
    });

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getFeishuAuthorizeHandler(app);
    const req = {
      query: { mode: 'oauth' },
      headers: {},
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(404);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      code: 'NOT_CONFIGURED',
      message: 'Feishu login is not configured',
    });
    expect((res as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect).not.toHaveBeenCalled();
  });

  it('redirects Feishu callback back to the original enterprise target after login', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'feishu',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        appId: 'cli_a90abd387f395bca',
        appSecret: 'secret',
        redirectUri: 'http://192.168.11.159:25809/api/auth/feishu/callback',
        externalIdField: 'union_id',
      },
    });
    mockExchangeFeishuCodeForUserAccessToken.mockResolvedValue('feishu-user-token');
    mockFetchFeishuUserInfo.mockResolvedValue({
      union_id: 'union-1',
    });
    mockResolveFeishuExternalId.mockReturnValue('union-1');
    mockGetByExternalId.mockResolvedValue({
      user_id: 'user-1',
    });
    mockFindById.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      role: 'org_admin',
      tenant_id: 'tenant-acme',
    });
    mockGenerateToken.mockResolvedValue('jwt-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const authorizeHandler = getRouteHandler(app, '/api/auth/feishu/authorize');
    const authorizeRes = createResponseMock() as unknown as express.Response;

    await authorizeHandler(
      {
        query: {
          mode: 'oauth',
          redirect: '/enterprise/auth',
        },
        headers: {},
      } as express.Request,
      authorizeRes,
      vi.fn()
    );

    const authorizeLocation = (authorizeRes as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect.mock
      .calls[0][0] as string;
    const state = new URL(authorizeLocation).searchParams.get('state');

    const callbackHandler = getRouteHandler(app, '/api/auth/feishu/callback');
    const callbackRes = createResponseMock() as unknown as express.Response;

    await callbackHandler(
      {
        query: {
          code: 'oauth-code',
          state,
        },
      } as express.Request,
      callbackRes,
      vi.fn()
    );

    expect((callbackRes as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect).toHaveBeenCalledWith(
      '/#/sessions'
    );
  });

  it('returns 504 when Feishu callback upstream request times out', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'feishu',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        appId: 'cli_a90abd387f395bca',
        appSecret: 'secret',
        redirectUri: 'http://192.168.11.159:25809/api/auth/feishu/callback',
        externalIdField: 'union_id',
      },
    });
    mockExchangeFeishuCodeForUserAccessToken.mockRejectedValue(new Error('Feishu request timeout after 12000ms'));

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const authorizeHandler = getRouteHandler(app, '/api/auth/feishu/authorize');
    const authorizeRes = createResponseMock() as unknown as express.Response;

    await authorizeHandler(
      {
        query: {
          mode: 'oauth',
          redirect: '/enterprise',
        },
        headers: {},
      } as express.Request,
      authorizeRes,
      vi.fn()
    );

    const authorizeLocation = (authorizeRes as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect.mock
      .calls[0][0] as string;
    const state = new URL(authorizeLocation).searchParams.get('state');

    const callbackHandler = getRouteHandler(app, '/api/auth/feishu/callback');
    const callbackRes = createResponseMock() as unknown as express.Response;

    await callbackHandler(
      {
        query: {
          code: 'oauth-code',
          state,
        },
        headers: {},
      } as express.Request,
      callbackRes,
      vi.fn()
    );

    expect((callbackRes as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(504);
    expect((callbackRes as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      'Feishu login timeout. Please retry.'
    );
  });

  it('returns upstream Feishu callback errors instead of generic internal server error', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'feishu',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        appId: 'cli_a90abd387f395bca',
        appSecret: 'secret',
        redirectUri: 'http://192.168.11.159:25809/api/auth/feishu/callback',
        externalIdField: 'union_id',
      },
    });
    mockExchangeFeishuCodeForUserAccessToken.mockRejectedValue(
      new Error('Feishu token exchange failed: redirect_uri not matched')
    );

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const authorizeHandler = getRouteHandler(app, '/api/auth/feishu/authorize');
    const authorizeRes = createResponseMock() as unknown as express.Response;

    await authorizeHandler(
      {
        query: {
          mode: 'oauth',
          redirect: '/enterprise/auth',
        },
        headers: {},
      } as express.Request,
      authorizeRes,
      vi.fn()
    );

    const authorizeLocation = (authorizeRes as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect.mock
      .calls[0][0] as string;
    const state = new URL(authorizeLocation).searchParams.get('state');

    const callbackHandler = getRouteHandler(app, '/api/auth/feishu/callback');
    const callbackRes = createResponseMock() as unknown as express.Response;

    await callbackHandler(
      {
        query: {
          code: 'oauth-code',
          state,
        },
        headers: {},
      } as express.Request,
      callbackRes,
      vi.fn()
    );

    expect((callbackRes as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(400);
    expect((callbackRes as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      'Feishu login failed: redirect_uri not matched'
    );
  });

  it('returns upstream DingTalk callback errors instead of generic internal server error', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'dingtalk',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        appKey: 'ding_app_key',
        appSecret: 'ding_secret',
        redirectUri: 'http://192.168.11.159:25809/api/auth/dingtalk/callback',
      },
    });
    mockExchangeDingTalkCodeForUserAccessToken.mockRejectedValue(
      new Error('DingTalk token exchange failed: invalid client credential')
    );

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const authorizeHandler = getRouteHandler(app, '/api/auth/dingtalk/authorize');
    const authorizeRes = createResponseMock() as unknown as express.Response;

    await authorizeHandler(
      {
        query: {
          mode: 'oauth',
          redirect: '/enterprise/auth',
        },
        headers: {},
      } as express.Request,
      authorizeRes,
      vi.fn()
    );

    const authorizeLocation = (authorizeRes as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect.mock
      .calls[0][0] as string;
    const state = new URL(authorizeLocation).searchParams.get('state');

    const callbackHandler = getRouteHandler(app, '/api/auth/dingtalk/callback');
    const callbackRes = createResponseMock() as unknown as express.Response;

    await callbackHandler(
      {
        query: {
          code: 'oauth-code',
          state,
        },
        headers: {},
      } as express.Request,
      callbackRes,
      vi.fn()
    );

    expect((callbackRes as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(400);
    expect((callbackRes as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      'DingTalk login failed: invalid client credential'
    );
  });

  it('returns upstream WeCom callback errors instead of generic internal server error', async () => {
    mockGetProvider.mockResolvedValue({
      provider: 'wecom',
      enabled: true,
      updated_at: '2026-05-25T08:00:00.000Z',
      config: {
        corpId: 'wxcorp',
        agentId: '1000001',
        secret: 'wecom_secret',
        redirectUri: 'http://192.168.11.159:25809/api/auth/wecom/callback',
      },
    });
    mockFetchWeComCorpAccessToken.mockRejectedValue(new Error('WeCom token request failed: invalid corpid'));

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const authorizeHandler = getRouteHandler(app, '/api/auth/wecom/authorize');
    const authorizeRes = createResponseMock() as unknown as express.Response;

    await authorizeHandler(
      {
        query: {
          mode: 'oauth',
          redirect: '/enterprise/auth',
        },
        headers: {},
      } as express.Request,
      authorizeRes,
      vi.fn()
    );

    const authorizeLocation = (authorizeRes as unknown as { redirect: ReturnType<typeof vi.fn> }).redirect.mock
      .calls[0][0] as string;
    const state = new URL(authorizeLocation).searchParams.get('state');

    const callbackHandler = getRouteHandler(app, '/api/auth/wecom/callback');
    const callbackRes = createResponseMock() as unknown as express.Response;

    await callbackHandler(
      {
        query: {
          code: 'oauth-code',
          state,
        },
        headers: {},
      } as express.Request,
      callbackRes,
      vi.fn()
    );

    expect((callbackRes as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(400);
    expect((callbackRes as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      'WeCom login failed: invalid corpid'
    );
  });
});
