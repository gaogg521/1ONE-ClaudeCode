/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from 'express';
import { AUTH_CONFIG } from '../../config/constants';
import { AuthService } from '../service/AuthService';

/**
 * Requires valid enterprise elevation cookie matching the current session user.
 * Use after `requireAdmin` / `requireSystemAdmin`.
 */
export async function requireEnterpriseElevation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw =
      typeof req.cookies === 'object' && req.cookies
        ? (req.cookies[AUTH_CONFIG.COOKIE.ENTERPRISE_NAME] as string | undefined)
        : undefined;
    if (!raw || typeof raw !== 'string' || raw.trim() === '') {
      res.status(403).json({
        success: false,
        message: 'Enterprise elevation required',
        code: 'ENTERPRISE_ELEVATION_REQUIRED',
      });
      return;
    }

    const verified = await AuthService.verifyEnterpriseElevationToken(raw.trim());
    const uid = req.user?.id;
    if (!verified || !uid || verified.userId !== uid) {
      res.status(403).json({
        success: false,
        message: 'Invalid or expired enterprise elevation',
        code: 'ENTERPRISE_ELEVATION_REQUIRED',
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[EnterpriseElevation] middleware error:', err);
    res.status(403).json({
      success: false,
      message: 'Enterprise elevation required',
      code: 'ENTERPRISE_ELEVATION_REQUIRED',
    });
  }
}
