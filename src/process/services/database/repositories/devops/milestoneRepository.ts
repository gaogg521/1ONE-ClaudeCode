/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export class MilestoneRepository {
  static async list(tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(
        `SELECT id, tenant_id, name, description, due_date, epic_count, completed_count, created_at
         FROM milestones
         WHERE tenant_id = ?
         ORDER BY created_at DESC`
      )
      .all(tenantId) as unknown[];
  }

  static async create(input: {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    dueDate: string;
    now: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO milestones (id, tenant_id, name, description, due_date, epic_count, completed_count, created_at, updated_at)
         VALUES (?,?,?,?,?,0,0,?,?)`
      )
      .run(input.id, input.tenantId, input.name, input.description, input.dueDate, input.now, input.now);
  }
}
