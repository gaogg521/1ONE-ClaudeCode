/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { isEnterpriseAdminRole } from '../../auth/enterpriseRoles';
import { CpackService } from '@process/services/devops/cpack/cpackService';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCpackRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/artifact-repos', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CpackService.listRepos(resolveDevopsTenantId(req));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/artifact-repos', apiRateLimiter, auth, async (req, res) => {
    try {
      const data = await CpackService.createRepo({
        tenantId: resolveDevopsTenantId(req),
        name: String(req.body?.name ?? ''),
        repoType: String(req.body?.repo_type ?? 'generic'),
        endpoint: String(req.body?.endpoint ?? ''),
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

  app.delete('/api/admin/artifact-repos/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      await CpackService.deleteRepo(String(req.params.id), resolveDevopsTenantId(req));
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.get('/api/admin/artifacts', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CpackService.listArtifacts({
        tenantId: resolveDevopsTenantId(req),
        userId: req.user!.id,
        isAdmin: isEnterpriseAdminRole(req.user!.role),
      });
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
