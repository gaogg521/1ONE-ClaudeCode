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
  tenant_id?: string;
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

/**
 * Apply a desktop SSO callback session from a `1one://sso-callback` deep link.
 *
 * The enterprise server's OAuth callback redirects the system browser to
 * `1one://sso-callback?token=...&userId=...&username=...&role=...&tenant_id=...&origin=...`.
 * The desktop app's deep-link handler calls this with the parsed params to seed
 * the local session, then refreshes auth context + navigates to the workspace.
 *
 * Returns the applied session, or null if required fields are missing.
 */
export function applySsoCallbackSession(params: Record<string, string>): WebuiDesktopSession | null {
  const token = params.token?.trim();
  const userId = params.userId?.trim();
  const username = params.username?.trim() || '';
  const role = params.role?.trim() || 'member';
  const tenant_id = params.tenant_id?.trim() || 'default';
  if (!token || !userId) {
    return null;
  }
  const session: WebuiDesktopSession = { userId, username, role, tenant_id, token };
  setWebuiDesktopSession(session);
  return session;
}
