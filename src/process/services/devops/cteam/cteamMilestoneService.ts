/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { MilestoneRepository } from '@process/services/database/repositories/devops/milestoneRepository';

export class CteamMilestoneService {
  static async listMilestones(tenantId: string): Promise<unknown[]> {
    return MilestoneRepository.list(tenantId);
  }

  static async createMilestone(input: {
    tenantId: string;
    name: string;
    description?: string;
    dueDate?: string;
  }): Promise<{ id: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('name required');
    }
    const id = randomUUID();
    await MilestoneRepository.create({
      id,
      tenantId: input.tenantId,
      name,
      description: input.description || '',
      dueDate: input.dueDate || '',
      now: Date.now(),
    });
    return { id };
  }
}
