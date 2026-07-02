/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CciService } from '@process/services/devops/cci/cciService';
import {
  requireDevopsAdmin,
  resolveDevopsTenantId,
  type DevopsRouteAuth,
} from './shared';
import { logRouteError } from '../../webuiLog';

export function registerCciRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/pipelines', apiRateLimiter, auth, async (req, res) => {
    try {
      const pipelines = await CciService.listPipelines(resolveDevopsTenantId(req));
      res.json({ success: true, data: pipelines });
    } catch (error) {
      logRouteError('[DevOpsRoute] list pipelines error', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/pipelines', apiRateLimiter, auth, requireDevopsAdmin, async (req, res) => {
    try {
      const pipeline = await CciService.createPipeline({
        tenantId: resolveDevopsTenantId(req),
        name: String(req.body?.name ?? ''),
        definition: req.body?.definition as { stages: unknown[] },
        associatedTeamId: req.body?.associatedTeamId
          ? String(req.body.associatedTeamId)
          : null,
      });
      res.json({ success: true, data: pipeline });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'Pipeline name is required' ||
          error.message === 'Invalid pipeline definition')
      ) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      logRouteError('[DevOpsRoute] create pipeline error', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.patch('/api/admin/pipelines/:pipelineId', apiRateLimiter, auth, requireDevopsAdmin, async (req, res) => {
    try {
      const pipeline = await CciService.updatePipeline({
        tenantId: resolveDevopsTenantId(req),
        pipelineId: String(req.params.pipelineId),
        name: String(req.body?.name ?? ''),
        definition: req.body?.definition as { stages: unknown[] },
        associatedTeamId: req.body?.associatedTeamId
          ? String(req.body.associatedTeamId)
          : null,
      });
      res.json({ success: true, data: pipeline });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'Pipeline name is required' ||
          error.message === 'Invalid pipeline definition')
      ) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      if (error instanceof Error && error.message === 'Pipeline not found') {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      logRouteError('[DevOpsRoute] update pipeline error', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/pipelines/run/:pipelineId', apiRateLimiter, auth, requireDevopsAdmin, async (req, res) => {
    try {
      const data = await CciService.triggerPipelineRun(
        String(req.params.pipelineId),
        req.user!.id,
        resolveDevopsTenantId(req)
      );
      res.json({ success: true, data });
    } catch (error) {
      logRouteError('[DevOpsRoute] trigger pipeline run error', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  app.get('/api/admin/pipelines/runs/:runId', apiRateLimiter, auth, async (req, res) => {
    try {
      const run = await CciService.getPipelineRun(
        String(req.params.runId),
        resolveDevopsTenantId(req)
      );
      if (!run) {
        res.status(404).json({ success: false, message: 'Pipeline run not found' });
        return;
      }
      res.json({ success: true, data: run });
    } catch (error) {
      logRouteError('[DevOpsRoute] get pipeline run error', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
