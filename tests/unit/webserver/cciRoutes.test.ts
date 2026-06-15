import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPipelineMock = vi.hoisted(() => vi.fn());
const updatePipelineMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/middleware/security', () => ({
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

vi.mock('@process/services/devops/cci/cciService', () => ({
  CciService: {
    listPipelines: vi.fn(),
    createPipeline: (...args: unknown[]) => createPipelineMock(...args),
    updatePipeline: (...args: unknown[]) => updatePipelineMock(...args),
    triggerPipelineRun: vi.fn(),
    getPipelineRun: vi.fn(),
  },
}));

vi.mock('@process/webserver/routes/devops/shared', () => ({
  requireDevopsAdmin: ((_req, _res, next) => next()) as RequestHandler,
  resolveDevopsTenantId: () => 'tenant-1',
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
  const layer = app.router.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods[method]);
  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

describe('cciRoutes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { registerCciRoutes } = await import('@process/webserver/routes/devops/cciRoutes');
    registerCciRoutes(app, ((_req, _res, next) => next()) as RequestHandler);
  });

  it('PATCH /api/admin/pipelines/:pipelineId updates an existing pipeline', async () => {
    updatePipelineMock.mockResolvedValue({
      id: 'pl-1',
      name: 'Updated Pipeline',
    });

    const handler = getRouteHandler(app, 'patch', '/api/admin/pipelines/:pipelineId');
    const req = {
      params: { pipelineId: 'pl-1' },
      body: {
        name: 'Updated Pipeline',
        definition: { stages: [] },
        associatedTeamId: null,
      },
    } as any;
    const res = createResponseMock();

    await handler(req, res, () => {});

    expect(updatePipelineMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      pipelineId: 'pl-1',
      name: 'Updated Pipeline',
      definition: { stages: [] },
      associatedTeamId: null,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'pl-1', name: 'Updated Pipeline' },
    });
  });
});
