/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CflowService } from '@process/services/devops/cflow/cflowService';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCflowRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/value-stream', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CflowService.listStages(resolveDevopsTenantId(req));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/value-stream', apiRateLimiter, auth, async (req, res) => {
    try {
      await CflowService.createStage({
        tenantId: resolveDevopsTenantId(req),
        requirementId: req.body?.requirement_id ? String(req.body.requirement_id) : undefined,
        stageName: String(req.body?.stage_name ?? ''),
        entryTime: req.body?.entry_time ? Number(req.body.entry_time) : undefined,
        exitTime: req.body?.exit_time ? Number(req.body.exit_time) : null,
        waitDurationMs: Number(req.body?.wait_duration_ms ?? 0),
        processDurationMs: Number(req.body?.process_duration_ms ?? 0),
      });
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
