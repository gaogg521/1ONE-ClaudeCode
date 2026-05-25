/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CteamMilestoneService } from '@process/services/devops/cteam/cteamMilestoneService';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCteamRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/milestones', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CteamMilestoneService.listMilestones(resolveDevopsTenantId(req));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/milestones', apiRateLimiter, auth, async (req, res) => {
    try {
      const data = await CteamMilestoneService.createMilestone({
        tenantId: resolveDevopsTenantId(req),
        name: String(req.body?.name ?? ''),
        description: String(req.body?.description ?? ''),
        dueDate: String(req.body?.due_date ?? ''),
      });
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === 'name required') {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
