/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CmeasService } from '@process/services/devops/cmeas/cmeasService';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCmeasRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.post('/api/admin/metrics', apiRateLimiter, auth, async (req, res) => {
    try {
      await CmeasService.createMetric({
        tenantId: resolveDevopsTenantId(req),
        metricType: String(req.body?.metric_type ?? ''),
        metricName: String(req.body?.metric_name ?? ''),
        value: Number(req.body?.value),
        period: String(req.body?.period ?? ''),
      });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid params') {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.get('/api/admin/metrics', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CmeasService.listMetrics(resolveDevopsTenantId(req), String(req.query.type || ''));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
