/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { isEnterpriseAdminRole } from '../../auth/enterpriseRoles';
import { getDatabase } from '@process/services/database';
import { ArtifactRepository } from '@process/services/database/repositories/devops/artifactRepository';
import { CpackService } from '@process/services/devops/cpack/cpackService';
import {
  canManageScopedResource,
  resolveResourceScope,
} from '../resourceScope';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCpackRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/artifact-repos', apiRateLimiter, auth, async (req, res) => {
    try {
      const tenantId = resolveDevopsTenantId(req);
      const rows = await CpackService.listRepos({
        tenantId,
        userId: req.user!.id,
        isAdmin: isEnterpriseAdminRole(req.user!.role),
      });
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/artifact-repos', apiRateLimiter, auth, async (req, res) => {
    try {
      const db = await getDatabase();
      const driver = db.getDriver();
      const tenantId = resolveDevopsTenantId(req);
      const resolvedScope = resolveResourceScope(req, driver, tenantId, {
        scope: req.body?.scope,
        team_id: req.body?.team_id,
      });
      if ('error' in resolvedScope) {
        res.status(resolvedScope.status).json({ success: false, message: resolvedScope.error });
        return;
      }
      const data = await CpackService.createRepo({
        tenantId,
        name: String(req.body?.name ?? ''),
        repoType: String(req.body?.repo_type ?? 'generic'),
        endpoint: String(req.body?.endpoint ?? ''),
        scope: resolvedScope.scope,
        teamId: resolvedScope.teamId,
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

  app.delete('/api/admin/artifact-repos/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      const db = await getDatabase();
      const driver = db.getDriver();
      const tenantId = resolveDevopsTenantId(req);
      const id = String(req.params.id);
      const resource = await ArtifactRepository.getRepoScope(id, tenantId);
      if (!resource) {
        res.status(404).json({ success: false, message: 'Not found' });
        return;
      }
      if (!canManageScopedResource(req, driver, tenantId, resource)) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
      await CpackService.deleteRepo(id, tenantId);
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
