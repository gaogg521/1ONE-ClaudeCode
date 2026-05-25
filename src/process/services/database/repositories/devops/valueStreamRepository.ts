/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export class ValueStreamRepository {
  static async list(tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(
        `SELECT vs.*, r.subject as req_subject
         FROM value_stream_stages vs
         LEFT JOIN requirements r ON vs.requirement_id = r.id
         WHERE vs.tenant_id = ?
         ORDER BY vs.entry_time DESC
         LIMIT 100`
      )
      .all(tenantId) as unknown[];
  }

  static async create(input: {
    id: string;
    tenantId: string;
    requirementId: string | null;
    stageName: string;
    entryTime: number;
    exitTime: number | null;
    waitDurationMs: number;
    processDurationMs: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO value_stream_stages (id, tenant_id, requirement_id, stage_name, entry_time, exit_time, wait_duration_ms, process_duration_ms)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.tenantId,
        input.requirementId,
        input.stageName,
        input.entryTime,
        input.exitTime,
        input.waitDurationMs,
        input.processDurationMs
      );
  }
}
