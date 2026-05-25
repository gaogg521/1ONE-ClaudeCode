/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export class MetricRepository {
  static async createSnapshot(input: {
    id: string;
    tenantId: string;
    metricType: string;
    metricName: string;
    value: number;
    period: string;
    recordedAt: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO metrics_snapshots (id, tenant_id, metric_type, metric_name, value, period, recorded_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.tenantId,
        input.metricType,
        input.metricName,
        input.value,
        input.period,
        input.recordedAt
      );
  }

  static async listSnapshots(tenantId: string, metricType?: string): Promise<unknown[]> {
    const db = await getDatabase();
    const driver = db.getDriver();
    return (
      metricType
        ? driver
            .prepare(
              `SELECT * FROM metrics_snapshots
               WHERE tenant_id=? AND metric_type=?
               ORDER BY recorded_at DESC LIMIT 200`
            )
            .all(tenantId, metricType)
        : driver
            .prepare(
              `SELECT * FROM metrics_snapshots
               WHERE tenant_id=?
               ORDER BY recorded_at DESC LIMIT 200`
            )
            .all(tenantId)
    ) as unknown[];
  }
}
