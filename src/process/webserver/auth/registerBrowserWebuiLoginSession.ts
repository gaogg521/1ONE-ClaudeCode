/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import {
  isElectronDesktopRequest,
  registerBrowserWebuiSession,
} from '@process/webserver/auth/browserSessionBridge';

export function registerBrowserWebuiLoginSession(
  req: Pick<Request, 'headers'>,
  user: { id: string; username: string; role?: string },
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
    token,
  });
}
