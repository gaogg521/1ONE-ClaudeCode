/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express } from 'express';
import { apiRateLimiter } from '../../middleware/security';
import { CcodeService } from '@process/services/devops/ccode/ccodeService';
import { resolveDevopsTenantId, type DevopsRouteAuth } from './shared';

export function registerCcodeRoutes(app: Express, auth: DevopsRouteAuth): void {
  app.get('/api/admin/code-repos', apiRateLimiter, auth, async (req, res) => {
    try {
      const rows = await CcodeService.listRepos(resolveDevopsTenantId(req));
      res.json({ success: true, data: rows });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/admin/code-repos', apiRateLimiter, auth, async (req, res) => {
    try {
      const data = await CcodeService.createRepo({
        tenantId: resolveDevopsTenantId(req),
        name: String(req.body?.name ?? ''),
        url: String(req.body?.url ?? ''),
        provider: String(req.body?.provider ?? 'gitlab'),
        credentialId: String(req.body?.credential_id ?? ''),
        defaultBranch: String(req.body?.default_branch ?? 'main'),
      });
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === 'name and url required') {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.delete('/api/admin/code-repos/:id', apiRateLimiter, auth, async (req, res) => {
    try {
      await CcodeService.deleteRepo(String(req.params.id), resolveDevopsTenantId(req));
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
