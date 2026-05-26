/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { PipelineService } from '@process/services/pipeline/PipelineService';
import { normalizePipelineDefinition, type IPipelineDefinition } from '@process/services/pipeline/PipelineService';

export class CciService {
  static async listPipelines(tenantId: string): Promise<unknown[]> {
    return PipelineService.getInstance().getPipelines(tenantId);
  }

  static async createPipeline(input: {
    tenantId: string;
    name: string;
    definition: { stages: unknown[] };
    associatedTeamId?: string | null;
  }): Promise<unknown> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Pipeline name is required');
    }

    normalizePipelineDefinition(input.definition);

    return PipelineService.getInstance().createPipeline({
      tenantId: input.tenantId,
      name,
      associatedTeamId: input.associatedTeamId || null,
      definition: input.definition as IPipelineDefinition,
    });
  }

  static async updatePipeline(input: {
    tenantId: string;
    pipelineId: string;
    name: string;
    definition: { stages: unknown[] };
    associatedTeamId?: string | null;
  }): Promise<unknown> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Pipeline name is required');
    }

    normalizePipelineDefinition(input.definition);

    return PipelineService.getInstance().updatePipeline({
      tenantId: input.tenantId,
      pipelineId: input.pipelineId,
      name,
      associatedTeamId: input.associatedTeamId || null,
      definition: input.definition as IPipelineDefinition,
    });
  }

  static async triggerPipelineRun(
    pipelineId: string,
    userId: string,
    tenantId: string
  ): Promise<{ runId: string }> {
    const runId = await PipelineService.getInstance().triggerPipelineRun(
      pipelineId,
      userId,
      'manual',
      tenantId
    );
    return { runId };
  }

  static async getPipelineRun(runId: string, tenantId: string): Promise<unknown | null> {
    return PipelineService.getInstance().getPipelineRun(runId, tenantId);
  }
}
