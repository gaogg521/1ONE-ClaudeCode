/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import { isElectronDesktopRequest, registerBrowserWebuiSession } from '@process/webserver/auth/browserSessionBridge';
import { TokenUtils } from '@process/webserver/auth/middleware/TokenMiddleware';

export function registerBrowserWebuiLoginSession(
  req: Pick<Request, 'headers'>,
  user: { id: string; username: string; role?: string; tenant_id?: string },
  token: string,
  roleOverride?: string
): void {
  if (isElectronDesktopRequest(req)) {
    return;
  }
  const role = roleOverride ?? user.role ?? 'member';
  registerBrowserWebuiSession({
    userId: user.id,
    username: user.username,
    role,
    tenant_id: user.tenant_id,
    token,
  });
}

/** Refresh desktop bridge when browser already has a session cookie (no new login POST). */
export function registerBrowserSessionFromRequest(
  req: Pick<Request, 'headers'>,
  user: { id: string; username: string; role?: string; tenant_id?: string },
  roleOverride?: string
): void {
  if (isElectronDesktopRequest(req)) {
    return;
  }
  const token = TokenUtils.extractFromRequest(req as Request);
  if (!token) {
    return;
  }
  registerBrowserWebuiLoginSession(req, user, token, roleOverride);
}
