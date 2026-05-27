/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { TestRepository } from '@process/services/database/repositories/devops/testRepository';

export class CtestService {
  static async listPlans(tenantId: string): Promise<unknown[]> {
    return TestRepository.listPlans(tenantId);
  }

  static async createPlan(input: {
    tenantId: string;
    name: string;
    description?: string;
    linkedRequirementId?: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('name required');
    }
    const id = randomUUID();
    await TestRepository.createPlan({
      id,
      tenantId: input.tenantId,
      name,
      description: input.description || '',
      linkedRequirementId: input.linkedRequirementId || null,
      createdBy: input.createdBy,
      now: Date.now(),
    });
    return { id };
  }

  static async listCases(planId: string, tenantId: string): Promise<unknown[]> {
    if (!planId || !(await TestRepository.hasPlanInTenant(planId, tenantId))) {
      throw new Error('plan not found');
    }
    return TestRepository.listCases(planId, tenantId);
  }

  static async createCase(input: {
    tenantId: string;
    planId: string;
    subject: string;
    steps?: string;
    expected?: string;
    assignedTo?: string;
  }): Promise<{ id: string }> {
    const subject = input.subject.trim();
    if (!input.planId || !subject) {
      throw new Error('plan_id and subject required');
    }
    if (!(await TestRepository.hasPlanInTenant(input.planId, input.tenantId))) {
      throw new Error('plan not found');
    }
    const id = randomUUID();
    await TestRepository.createCase({
      id,
      planId: input.planId,
      subject,
      steps: input.steps || '',
      expected: input.expected || '',
      assignedTo: input.assignedTo || '',
      createdAt: Date.now(),
    });
    return { id };
  }

  static async updateCaseStatus(input: { id: string; tenantId: string; status: string }): Promise<void> {
    await TestRepository.updateCaseStatus(input.id, input.tenantId, input.status);
  }
}
