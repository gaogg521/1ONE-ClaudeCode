/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import {
  MilestoneRepository,
  type MilestoneEpicRecord,
} from '@process/services/database/repositories/devops/milestoneRepository';

export class CteamMilestoneService {
  static async listMilestones(tenantId: string): Promise<unknown[]> {
    return MilestoneRepository.list(tenantId);
  }

  static async listMilestoneEpics(tenantId: string, milestoneId: string): Promise<MilestoneEpicRecord[]> {
    return MilestoneRepository.listEpics(tenantId, milestoneId);
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

  static async updateMilestone(input: {
    tenantId: string;
    id: string;
    name?: string;
    description?: string;
    dueDate?: string;
  }): Promise<boolean> {
    return MilestoneRepository.update({
      id: input.id,
      tenantId: input.tenantId,
      name: input.name !== undefined ? input.name.trim() : undefined,
      description: input.description,
      dueDate: input.dueDate,
      now: Date.now(),
    });
  }

  static async deleteMilestone(tenantId: string, id: string): Promise<boolean> {
    return MilestoneRepository.delete(id, tenantId);
  }
}
