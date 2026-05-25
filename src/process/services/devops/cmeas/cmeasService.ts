/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { MetricRepository } from '@process/services/database/repositories/devops/metricRepository';

export class CmeasService {
  static async createMetric(input: {
    tenantId: string;
    metricType: string;
    metricName: string;
    value: number;
    period?: string;
  }): Promise<void> {
    if (!input.metricType || !input.metricName || Number.isNaN(Number(input.value))) {
      throw new Error('invalid params');
    }
    await MetricRepository.createSnapshot({
      id: randomUUID(),
      tenantId: input.tenantId,
      metricType: input.metricType,
      metricName: input.metricName,
      value: Number(input.value),
      period: input.period || '',
      recordedAt: Date.now(),
    });
  }

  static async listMetrics(tenantId: string, metricType?: string): Promise<unknown[]> {
    return MetricRepository.listSnapshots(tenantId, metricType);
  }
}
