/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export type MilestoneEpicRecord = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updated_at: number;
};

export class MilestoneRepository {
  static async list(tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(
        `SELECT m.id, m.tenant_id, m.name, m.description, m.due_date, m.created_at,
          COALESCE((
            SELECT COUNT(*)
            FROM requirements r
            WHERE r.milestone_id = m.id AND r.type = 'epic' AND r.tenant_id = m.tenant_id
          ), 0) AS epic_count,
          COALESCE((
            SELECT COUNT(*)
            FROM requirements r
            WHERE r.milestone_id = m.id AND r.type = 'epic' AND r.status = 'completed' AND r.tenant_id = m.tenant_id
          ), 0) AS completed_count
         FROM milestones m
         WHERE m.tenant_id = ?
         ORDER BY m.created_at DESC`
      )
      .all(tenantId) as unknown[];
  }

  static async listEpics(tenantId: string, milestoneId: string): Promise<MilestoneEpicRecord[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(
        `SELECT id, subject, status, priority, updated_at
         FROM requirements
         WHERE tenant_id = ? AND milestone_id = ? AND type = 'epic'
         ORDER BY updated_at DESC`
      )
      .all(tenantId, milestoneId) as MilestoneEpicRecord[];
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
