/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CteamMilestoneService } from '@process/services/devops/cteam/cteamMilestoneService';
import { recordDevopsAudit, DEVOPS_AUDIT_ACTIONS } from '../../auth/auditLogService';
import { requireDevopsAdmin, resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCteamRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/milestones', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CteamMilestoneService.listMilestones(resolveDevopsTenantId(req));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/milestones', apiRateLimiter, auth, requireDevopsAdmin, async (req, res) => {
    try {
      const data = await CteamMilestoneService.createMilestone({
        tenantId: resolveDevopsTenantId(req),
        name: String(req.body?.name ?? ''),
        description: String(req.body?.description ?? ''),
        dueDate: String(req.body?.due_date ?? ''),
      });
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.milestoneCreate, `milestone:${data.id}`);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === 'name required') {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.patch('/api/admin/milestones/:id', apiRateLimiter, auth, requireDevopsAdmin, async (req, res) => {
    try {
      const tenantId = resolveDevopsTenantId(req);
      const id = String(req.params.id);
      const updated = await CteamMilestoneService.updateMilestone({
        tenantId,
        id,
        name: req.body?.name !== undefined ? String(req.body.name) : undefined,
        description: req.body?.description !== undefined ? String(req.body.description) : undefined,
        dueDate: req.body?.due_date !== undefined ? String(req.body.due_date) : undefined,
      });
      if (!updated) {
        res.status(404).json({ success: false, message: 'Milestone not found' });
        return;
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.delete('/api/admin/milestones/:id', apiRateLimiter, auth, requireDevopsAdmin, async (req, res) => {
    try {
      const tenantId = resolveDevopsTenantId(req);
      const id = String(req.params.id);
      const deleted = await CteamMilestoneService.deleteMilestone(tenantId, id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Milestone not found' });
        return;
      }
      void recordDevopsAudit(req, DEVOPS_AUDIT_ACTIONS.requirementDelete, `milestone:${id}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.get('/api/admin/milestones/:id/epics', apiRateLimiter, auth, async (req, res) => {
    try {
      const epics = await CteamMilestoneService.listMilestoneEpics(
        resolveDevopsTenantId(req),
        String(req.params.id)
      );
      res.json({ success: true, data: epics });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
