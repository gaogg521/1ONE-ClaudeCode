import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockValidateToken,
  mockGetDatabase,
  prepareMock,
  getTenantMock,
  updateTenantMock,
  publishOrgConfigChangedMock,
} = vi.hoisted(() => {
  const getTenant = vi.fn();
  const updateTenant = vi.fn();
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('SELECT id, name, created_at, updated_at FROM tenants')) {
      return { get: getTenant };
    }
    if (sql.includes('UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?')) {
      return { run: updateTenant };
    }
    return { run: vi.fn(), get: vi.fn(), all: vi.fn() };
  });

  return {
    mockValidateToken: vi.fn(
      () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
    ),
    mockGetDatabase: vi.fn(),
    prepareMock: prepare,
    getTenantMock: getTenant,
    updateTenantMock: updateTenant,
    publishOrgConfigChangedMock: vi.fn(),
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

vi.mock('@process/webserver/auth/providers/DingTalkAuthProvider', () => ({
  testDingTalkAppCredentials: vi.fn(),
}));

vi.mock('@process/webserver/auth/providers/WeComAuthProvider', () => ({
  testWeComAppCredentials: vi.fn(),
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
  isSystemAdminRole: () => true,
  isWebuiBuiltinAdministrator: () => true,
}));

vi.mock('@process/webserver/auth/enterpriseJoinService', () => ({
  EnterpriseJoinError: class EnterpriseJoinError extends Error {},
  createEnterpriseInvite: vi.fn(),
  createEnterpriseTenant: vi.fn(),
  listEnterpriseInvites: vi.fn(),
  revokeEnterpriseInvite: vi.fn(),
}));

vi.mock('@process/webserver/orgConfigBroadcast', () => ({
  publishLoginChannelsChanged: vi.fn(),
  publishOrgConfigChanged: (...args: unknown[]) => publishOrgConfigChangedMock(...args),
}));

vi.mock('@process/webserver/auth/enterpriseSsoPolicy', () => ({
  assertEnterpriseSsoEnableAllowed: vi.fn(),
  isEnterpriseSsoProvider: vi.fn(() => false),
}));

vi.mock('@process/webserver/auth/browserSessionBridge', () => ({
  isElectronDesktopRequest: vi.fn(() => false),
}));

vi.mock('@process/webserver/auth/orgEditionSettings', () => ({
  getOrgEditionSettings: vi.fn(async () => ({ editionSwitcherEnabled: false })),
  setOrgEditionSettings: vi.fn(),
}));

vi.mock('@process/webserver/auth/auditLogService', () => ({
  GOVERNANCE_AUDIT_ACTIONS: {},
  recordGovernanceAudit: vi.fn(),
}));

vi.mock('@process/webserver/auth/instanceGovernance', () => ({
  assertCanRevokeSystemAdmin: vi.fn(),
  claimSystemAdmin: vi.fn(),
  InstanceGovernanceError: class InstanceGovernanceError extends Error {},
}));

function getRouteHandler(app: express.Express, path: string, method: 'get' | 'patch'): express.RequestHandler {
  const layer = app.router.stack.find(
    (entry: {
      route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: express.RequestHandler }> };
    }) => entry.route?.path === path && entry.route?.methods?.[method]
  );

  return layer?.route?.stack?.at(-1)?.handle as express.RequestHandler;
}

describe('registerAdminRoutes /api/admin/enterprise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatabase.mockResolvedValue({
      getDriver: () => ({
        prepare: prepareMock,
      }),
    });
  });

  it('returns current tenant profile for enterprise admins', async () => {
    getTenantMock.mockReturnValue({
      id: 'tenant_acme',
      name: 'Acme Team',
      created_at: 1717230000000,
      updated_at: 1717231000000,
    });

    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const handler = getRouteHandler(app, '/api/admin/enterprise', 'get');
    const req = {
      user: {
        id: 'u1',
        role: 'org_admin',
        tenant_id: 'tenant_acme',
      },
    } as unknown as express.Request;
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(getTenantMock).toHaveBeenCalledWith('tenant_acme');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        id: 'tenant_acme',
        name: 'Acme Team',
        created_at: 1717230000000,
        updated_at: 1717231000000,
      },
    });
  });

  it('updates tenant name and publishes org refresh', async () => {
    const { registerAdminRoutes } = await import('@process/webserver/routes/adminRoutes');
    const app = express();
    registerAdminRoutes(app);

    const handler = getRouteHandler(app, '/api/admin/enterprise', 'patch');
    const req = {
      body: {
        name: 'Acme Next',
      },
      user: {
        id: 'u1',
        role: 'org_admin',
        tenant_id: 'tenant_acme',
      },
    } as unknown as express.Request;
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(updateTenantMock).toHaveBeenCalledWith('Acme Next', expect.any(Number), 'tenant_acme');
    expect(publishOrgConfigChangedMock).toHaveBeenCalledWith({
      tenantId: 'tenant_acme',
      scope: 'enterprise-profile',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
