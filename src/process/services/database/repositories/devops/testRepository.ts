/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export class TestRepository {
  static async hasPlanInTenant(planId: string, tenantId: string): Promise<boolean> {
    const db = await getDatabase();
    const row = db
      .getDriver()
      .prepare(`SELECT 1 FROM test_plans WHERE id = ? AND tenant_id = ?`)
      .get(planId, tenantId);
    return Boolean(row);
  }

  static async listPlans(tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(`SELECT * FROM test_plans WHERE tenant_id=? ORDER BY created_at DESC`)
      .all(tenantId) as unknown[];
  }

  static async createPlan(input: {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    linkedRequirementId: string | null;
    createdBy: string;
    now: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO test_plans (id, tenant_id, name, description, linked_requirement_id, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.tenantId,
        input.name,
        input.description,
        input.linkedRequirementId,
        input.createdBy,
        input.now,
        input.now
      );
  }

  static async listCases(planId: string, tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(
        `SELECT tc.*
         FROM test_cases tc
         JOIN test_plans tp ON tp.id = tc.plan_id
         WHERE tc.plan_id=? AND tp.tenant_id=?
         ORDER BY tc.created_at DESC`
      )
      .all(planId, tenantId) as unknown[];
  }

  static async createCase(input: {
    id: string;
    planId: string;
    subject: string;
    steps: string;
    expected: string;
    assignedTo: string;
    createdAt: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO test_cases (id, plan_id, subject, steps, expected, assigned_to, created_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.planId,
        input.subject,
        input.steps,
        input.expected,
        input.assignedTo,
        input.createdAt
      );
  }

  static async updateCaseStatus(id: string, tenantId: string, status: string): Promise<void> {
    const db = await getDatabase();
    const result = db
      .getDriver()
      .prepare(
        `UPDATE test_cases SET status = ?
         WHERE id = ? AND plan_id IN (SELECT id FROM test_plans WHERE tenant_id = ?)`
      )
      .run(status, id, tenantId);
    if ((result as { changes: number }).changes === 0) {
      throw new Error('not found');
    }
  }
}
