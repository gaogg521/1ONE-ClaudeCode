/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CtestService } from '@process/services/devops/ctest/ctestService';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCtestRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/test-plans', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CtestService.listPlans(resolveDevopsTenantId(req));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/test-plans', apiRateLimiter, auth, async (req, res) => {
    try {
      const data = await CtestService.createPlan({
        tenantId: resolveDevopsTenantId(req),
        name: String(req.body?.name ?? ''),
        description: String(req.body?.description ?? ''),
        linkedRequirementId: req.body?.linked_requirement_id
          ? String(req.body.linked_requirement_id)
          : undefined,
        createdBy: req.user!.id,
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

  app.get('/api/admin/test-cases', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CtestService.listCases(
        String(req.query.planId || ''),
        resolveDevopsTenantId(req)
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      if (error instanceof Error && error.message === 'plan not found') {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/test-cases', apiRateLimiter, auth, async (req, res) => {
    try {
      const data = await CtestService.createCase({
        tenantId: resolveDevopsTenantId(req),
        planId: String(req.body?.plan_id ?? ''),
        subject: String(req.body?.subject ?? ''),
        steps: String(req.body?.steps ?? ''),
        expected: String(req.body?.expected ?? ''),
        assignedTo: String(req.body?.assigned_to ?? ''),
      });
      res.json({ success: true, data });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'plan_id and subject required' || error.message === 'plan not found')
      ) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/test-cases/:id — 更新用例状态（passed / failed / pending）
  app.patch('/api/admin/test-cases/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveDevopsTenantId(req);
      const id = String(req.params.id);
      const status = String(req.body?.status ?? '');
      if (!['pending', 'passed', 'failed', 'blocked'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status' });
        return;
      }
      await CtestService.updateCaseStatus({ id, tenantId, status });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'not found') {
        res.status(404).json({ success: false, message: 'Test case not found' });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
