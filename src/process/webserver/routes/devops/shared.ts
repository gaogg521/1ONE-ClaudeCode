/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isEnterpriseAdminRole } from '../../auth/enterpriseRoles';

export function requireDevopsAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !isEnterpriseAdminRole(req.user.role)) {
    res.status(403).json({ success: false, message: 'Admin only' });
    return;
  }
  next();
}

export function resolveDevopsTenantId(req: Request): string {
  return (req.user?.tenant_id ?? 'default').trim() || 'default';
}

export type DevopsRouteAuth = RequestHandler;
