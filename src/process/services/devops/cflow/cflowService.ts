/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { ValueStreamRepository } from '@process/services/database/repositories/devops/valueStreamRepository';

export class CflowService {
  static async listStages(tenantId: string): Promise<unknown[]> {
    return ValueStreamRepository.list(tenantId);
  }

  static async createStage(input: {
    tenantId: string;
    requirementId?: string;
    stageName: string;
    entryTime?: number;
    exitTime?: number | null;
    waitDurationMs?: number;
    processDurationMs?: number;
  }): Promise<void> {
    await ValueStreamRepository.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      requirementId: input.requirementId || null,
      stageName: input.stageName,
      entryTime: input.entryTime || Date.now(),
      exitTime: input.exitTime ?? null,
      waitDurationMs: input.waitDurationMs || 0,
      processDurationMs: input.processDurationMs || 0,
    });
  }
}
