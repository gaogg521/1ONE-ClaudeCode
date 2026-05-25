import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockValidateToken,
  mockGetDatabase,
  prepareMock,
  runTeamInsertMock,
  runMembershipInsertMock,
} = vi.hoisted(() => {
  const runTeamInsert = vi.fn();
  const runMembershipInsert = vi.fn();
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('INSERT INTO teams')) {
      return { run: runTeamInsert };
    }
    if (sql.includes('INSERT INTO team_memberships')) {
      return { run: runMembershipInsert };
    }
    return { run: vi.fn(), get: vi.fn(), all: vi.fn() };
  });

  return {
    mockValidateToken: vi.fn(() => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
    mockGetDatabase: vi.fn(),
    prepareMock: prepare,
    runTeamInsertMock: runTeamInsert,
    runMembershipInsertMock: runMembershipInsert,
  };
});

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
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    hashPassword: vi.fn(),
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
    validateToken: mockValidateToken,
  },
}));

const passThroughMiddleware = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

vi.mock('@process/webserver/middleware/rateLimiter', () => ({
  apiRateLimiter: passThroughMiddleware,
}));

vi.mock('@process/services/database', () => ({
  getDatabase: mockGetDatabase,
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

function getCreateTeamHandler(app: express.Express): express.RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: express.RequestHandler }> } }) =>
      entry.route?.path === '/api/admin/teams' && entry.route?.methods?.post
  );

  return layer?.route?.stack?.at(-1)?.handle as express.RequestHandler;
}

describe('registerAdminRoutes /api/admin/teams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatabase.mockResolvedValue({
      getDriver: () => ({
        prepare: prepareMock,
        transaction: (fn: () => void) => fn,
      }),
    });
  });

  it('creates teams with a non-null lead_agent_id to match current schema', async () => {
    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const handler = getCreateTeamHandler(app);
    const req = {
      body: {
        name: '企业巡检团队',
        workspace: 'D:\\workspace\\enterprise-qa',
        workspace_mode: 'shared',
      },
      user: {
        id: 'system_default_user',
        role: 'org_admin',
        tenant_id: 'tenant_adaeed463219',
      },
    } as unknown as express.Request;
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(runTeamInsertMock).toHaveBeenCalledOnce();
    expect(prepareMock).toHaveBeenCalledWith(
      expect.stringContaining("VALUES (?, ?, ?, ?, ?, ?, '', '[]', ?, ?)")
    );
    expect(runMembershipInsertMock).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: expect.any(String) },
    });
  });
});
