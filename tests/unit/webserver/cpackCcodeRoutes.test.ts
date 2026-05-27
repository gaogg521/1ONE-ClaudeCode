import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@process/webserver/auth/enterpriseRoles', () => ({
  isEnterpriseAdminRole: (role?: string) => role === 'org_admin',
}));

vi.mock('@process/webserver/middleware/security', () => ({
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

const mockAll = vi.fn();
const mockRun = vi.fn(() => ({ changes: 1 }));
const mockGet = vi.fn();

const mockDriver = {
  prepare: vi.fn(() => ({
    all: mockAll,
    run: mockRun,
    get: mockGet,
  })),
};

vi.mock('@process/services/database', () => ({
  getDatabase: async () => ({
    getDriver: () => mockDriver,
  }),
}));

const listArtifactReposMock = vi.hoisted(() => vi.fn());
const createArtifactRepoMock = vi.hoisted(() => vi.fn());
const deleteArtifactRepoMock = vi.hoisted(() => vi.fn());
const listArtifactsMock = vi.hoisted(() => vi.fn());
const getRepoScopeMock = vi.hoisted(() => vi.fn());

vi.mock('@process/services/database/repositories/devops/artifactRepository', () => ({
  ArtifactRepository: {
    getRepoScope: (...args: unknown[]) => getRepoScopeMock(...args),
  },
}));

vi.mock('@process/services/devops/cpack/cpackService', () => ({
  CpackService: {
    listRepos: (...args: unknown[]) => listArtifactReposMock(...args),
    createRepo: (...args: unknown[]) => createArtifactRepoMock(...args),
    deleteRepo: (...args: unknown[]) => deleteArtifactRepoMock(...args),
    listArtifacts: (...args: unknown[]) => listArtifactsMock(...args),
  },
}));

const listCodeReposMock = vi.hoisted(() => vi.fn());
const createCodeRepoMock = vi.hoisted(() => vi.fn());
const deleteCodeRepoMock = vi.hoisted(() => vi.fn());
const getCodeRepoScopeMock = vi.hoisted(() => vi.fn());

vi.mock('@process/services/database/repositories/devops/codeRepoRepository', () => ({
  CodeRepoRepository: {
    getScope: (...args: unknown[]) => getCodeRepoScopeMock(...args),
  },
}));

vi.mock('@process/services/devops/ccode/ccodeService', () => ({
  CcodeService: {
    listRepos: (...args: unknown[]) => listCodeReposMock(...args),
    createRepo: (...args: unknown[]) => createCodeRepoMock(...args),
    deleteRepo: (...args: unknown[]) => deleteCodeRepoMock(...args),
  },
}));

function createResponseMock() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
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

describe('cpack and ccode scoped routes', () => {
  let app: express.Express;
  const auth: RequestHandler = (req, _res, next) => {
    req.user = { id: 'user-1', tenant_id: 'tenant-1', role: 'member' };
    next();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { registerCpackRoutes } = await import('@process/webserver/routes/devops/cpackRoutes');
    const { registerCcodeRoutes } = await import('@process/webserver/routes/devops/ccodeRoutes');
    registerCpackRoutes(app, auth);
    registerCcodeRoutes(app, auth);
  });

  it('lists artifact repos with user visibility context', async () => {
    listArtifactReposMock.mockResolvedValueOnce([{ id: 'repo-1' }]);
    const handler = getRouteHandler(app, 'get', '/api/admin/artifact-repos');
    const res = createResponseMock();

    await handler({ user: { id: 'user-1', tenant_id: 'tenant-1', role: 'member' } } as any, res);

    expect(listArtifactReposMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      isAdmin: false,
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 'repo-1' }] });
  });

  it('rejects team-scoped artifact repo creation without team_id', async () => {
    const handler = getRouteHandler(app, 'post', '/api/admin/artifact-repos');
    const res = createResponseMock();

    await handler(
      {
        user: { id: 'user-1', tenant_id: 'tenant-1', role: 'member' },
        body: { name: 'repo', scope: 'team' },
      } as any,
      res
    );

    expect(createArtifactRepoMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'team_id is required for team scope',
    });
  });

  it('creates team-scoped artifact repo when user is a team member', async () => {
    mockGet.mockReturnValueOnce({ 1: 1 });
    createArtifactRepoMock.mockResolvedValueOnce({ id: 'repo-1' });
    const handler = getRouteHandler(app, 'post', '/api/admin/artifact-repos');
    const res = createResponseMock();

    await handler(
      {
        user: { id: 'user-1', tenant_id: 'tenant-1', role: 'member' },
        body: { name: 'repo', scope: 'team', team_id: 'team-1' },
      } as any,
      res
    );

    expect(createArtifactRepoMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      name: 'repo',
      repoType: 'generic',
      endpoint: '',
      scope: 'team',
      teamId: 'team-1',
      createdBy: 'user-1',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'repo-1' } });
  });

  it('forbids deleting artifact repo without manage permission', async () => {
    getRepoScopeMock.mockResolvedValueOnce({
      scope: 'team',
      team_id: 'team-1',
      created_by: 'other-user',
    });
    mockGet.mockReturnValueOnce(undefined);
    const handler = getRouteHandler(app, 'delete', '/api/admin/artifact-repos/:id');
    const res = createResponseMock();

    await handler(
      {
        user: { id: 'user-1', tenant_id: 'tenant-1', role: 'member' },
        params: { id: 'repo-1' },
      } as any,
      res
    );

    expect(deleteArtifactRepoMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lists code repos with user visibility context', async () => {
    listCodeReposMock.mockResolvedValueOnce([{ id: 'code-1' }]);
    const handler = getRouteHandler(app, 'get', '/api/admin/code-repos');
    const res = createResponseMock();

    await handler({ user: { id: 'user-1', tenant_id: 'tenant-1', role: 'member' } } as any, res);

    expect(listCodeReposMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      isAdmin: false,
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 'code-1' }] });
  });

  it('creates team-scoped code repo when user is a team member', async () => {
    mockGet.mockReturnValueOnce({ 1: 1 });
    createCodeRepoMock.mockResolvedValueOnce({ id: 'code-1' });
    const handler = getRouteHandler(app, 'post', '/api/admin/code-repos');
    const res = createResponseMock();

    await handler(
      {
        user: { id: 'user-1', tenant_id: 'tenant-1', role: 'member' },
        body: {
          name: 'main',
          url: 'https://gitlab.com/team/main.git',
          scope: 'team',
          team_id: 'team-1',
        },
      } as any,
      res
    );

    expect(createCodeRepoMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      name: 'main',
      url: 'https://gitlab.com/team/main.git',
      provider: 'gitlab',
      credentialId: '',
      defaultBranch: 'main',
      scope: 'team',
      teamId: 'team-1',
      createdBy: 'user-1',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'code-1' } });
  });
});
