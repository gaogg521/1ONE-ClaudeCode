/**
 * Desktop WebUI login session (Bearer JWT) for enterprise admin APIs.
 * Cookies are scoped to the WebUI host (127.0.0.1:port); the Electron renderer may run on another origin.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isWebuiBuiltinAdministrator } from '@/common/auth/enterpriseRoles';

const STORAGE_KEY = 'one-webui-desktop-session';

export type WebuiDesktopSession = {
  userId: string;
  username: string;
  role: string;
  token: string;
};

export function setWebuiDesktopSession(session: WebuiDesktopSession | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!session) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getWebuiDesktopSession(): WebuiDesktopSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as WebuiDesktopSession;
    if (!parsed?.token || !parsed.userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Bearer for /api/admin/* on desktop — only when the logged-in user is an enterprise admin. */
export function getDesktopAdminBearerToken(): string | null {
  const session = getWebuiDesktopSession();
  if (!session) {
    return null;
  }
  if (
    !isWebuiBuiltinAdministrator({
      id: session.userId,
      username: session.username,
      role: session.role,
    })
  ) {
    return null;
  }
  return session.token;
}
