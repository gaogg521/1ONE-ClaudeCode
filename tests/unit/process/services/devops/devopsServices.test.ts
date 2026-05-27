import { beforeEach, describe, expect, it, vi } from 'vitest';

const createArtifactRepoMock = vi.hoisted(() => vi.fn());
const createCodeRepoMock = vi.hoisted(() => vi.fn());
const createMetricSnapshotMock = vi.hoisted(() => vi.fn());
const createTestCaseMock = vi.hoisted(() => vi.fn());
const hasPlanInTenantMock = vi.hoisted(() => vi.fn());
const pipelineCreateMock = vi.hoisted(() => vi.fn());
const pipelineTriggerMock = vi.hoisted(() => vi.fn());
const pipelineGetInstanceMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@process/services/database/repositories/devops/artifactRepository',
  () => ({
    ArtifactRepository: {
      createRepo: (...args: unknown[]) => createArtifactRepoMock(...args),
      listRepos: vi.fn(),
      deleteRepo: vi.fn(),
      listArtifacts: vi.fn(),
    },
  })
);

vi.mock(
  '@process/services/database/repositories/devops/codeRepoRepository',
  () => ({
    CodeRepoRepository: {
      create: (...args: unknown[]) => createCodeRepoMock(...args),
      list: vi.fn(),
      delete: vi.fn(),
    },
  })
);

vi.mock(
  '@process/services/database/repositories/devops/metricRepository',
  () => ({
    MetricRepository: {
      createSnapshot: (...args: unknown[]) => createMetricSnapshotMock(...args),
      listSnapshots: vi.fn(),
    },
  })
);

vi.mock(
  '@process/services/database/repositories/devops/testRepository',
  () => ({
    TestRepository: {
      createCase: (...args: unknown[]) => createTestCaseMock(...args),
      hasPlanInTenant: (...args: unknown[]) => hasPlanInTenantMock(...args),
      listPlans: vi.fn(),
      createPlan: vi.fn(),
      listCases: vi.fn(),
    },
  })
);

vi.mock('@process/services/pipeline/PipelineService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/services/pipeline/PipelineService')>();
  return {
    ...actual,
    PipelineService: {
      getInstance: (...args: unknown[]) => pipelineGetInstanceMock(...args),
    },
  };
});

import { CpackService } from '@process/services/devops/cpack/cpackService';
import { CcodeService } from '@process/services/devops/ccode/ccodeService';
import { CmeasService } from '@process/services/devops/cmeas/cmeasService';
import { CtestService } from '@process/services/devops/ctest/ctestService';
import { CciService } from '@process/services/devops/cci/cciService';

describe('devops services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineGetInstanceMock.mockReturnValue({
      createPipeline: pipelineCreateMock,
      getPipelines: vi.fn(),
      triggerPipelineRun: pipelineTriggerMock,
      getPipelineRun: vi.fn(),
    });
    hasPlanInTenantMock.mockResolvedValue(true);
  });

  it('rejects invalid cpack repo payloads', async () => {
    await expect(
      CpackService.createRepo({
        tenantId: 'tenant-1',
        name: '   ',
        scope: 'personal',
        teamId: null,
        createdBy: 'user-1',
      })
    ).rejects.toThrow('name required');
    expect(createArtifactRepoMock).not.toHaveBeenCalled();
  });

  it('rejects invalid code repo payloads', async () => {
    await expect(
      CcodeService.createRepo({
        tenantId: 'tenant-1',
        name: 'repo',
        url: '   ',
        scope: 'personal',
        teamId: null,
        createdBy: 'user-1',
      })
    ).rejects.toThrow('name and url required');
    expect(createCodeRepoMock).not.toHaveBeenCalled();
  });

  it('rejects invalid metric snapshots', async () => {
    await expect(
      CmeasService.createMetric({
        tenantId: 'tenant-1',
        metricType: '',
        metricName: '',
        value: Number.NaN,
      })
    ).rejects.toThrow('invalid params');
    expect(createMetricSnapshotMock).not.toHaveBeenCalled();
  });

  it('rejects invalid test case payloads', async () => {
    await expect(
      CtestService.createCase({
        tenantId: 'tenant-1',
        planId: '',
        subject: '   ',
      })
    ).rejects.toThrow('plan_id and subject required');
    expect(createTestCaseMock).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant test case creation', async () => {
    hasPlanInTenantMock.mockResolvedValue(false);

    await expect(
      CtestService.createCase({
        tenantId: 'tenant-1',
        planId: 'plan-1',
        subject: 'smoke',
      })
    ).rejects.toThrow('plan not found');
    expect(createTestCaseMock).not.toHaveBeenCalled();
  });

  it('rejects invalid pipeline definitions', async () => {
    await expect(
      CciService.createPipeline({
        tenantId: 'tenant-1',
        name: 'release',
        definition: {} as { stages: unknown[] },
      })
    ).rejects.toThrow('Invalid pipeline definition');
    expect(pipelineCreateMock).not.toHaveBeenCalled();
  });

  it('passes tenant id when triggering pipeline runs', async () => {
    pipelineTriggerMock.mockResolvedValue('run-1');

    await expect(CciService.triggerPipelineRun('pipeline-1', 'user-1', 'tenant-1')).resolves.toEqual({
      runId: 'run-1',
    });
    expect(pipelineTriggerMock).toHaveBeenCalledWith('pipeline-1', 'user-1', 'manual', 'tenant-1');
  });
});
