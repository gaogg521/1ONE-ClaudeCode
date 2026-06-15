/**
 * In-memory bridge: browser WebUI logins → desktop session sync (same machine).
 * Tokens are never exposed over public HTTP; desktop reads via main-process IPC only.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import {
  isElectronDesktopWebuiRequest,
  ONE_WEBUI_CLIENT_HEADER,
  ONE_WEBUI_CLIENT_DESKTOP,
} from '@/common/config/webuiClientHeaders';

export type BrowserSessionSnapshot = {
  userId: string;
  username: string;
  role: string;
  tenant_id: string;
  token: string;
  updatedAt: number;
};

const browserSessions = new Map<string, BrowserSessionSnapshot>();

function sessionKey(userId: string): string {
  return userId;
}

export function isElectronDesktopRequest(req: Pick<Request, 'headers'>): boolean {
  return isElectronDesktopWebuiRequest(req.headers as Record<string, unknown>);
}

export function registerBrowserWebuiSession(input: {
  userId: string;
  username: string;
  role: string;
  tenant_id?: string;
  token: string;
}): void {
  const snapshot: BrowserSessionSnapshot = {
    userId: input.userId,
    username: input.username,
    role: input.role,
    tenant_id: input.tenant_id ?? 'default',
    token: input.token,
    updatedAt: Date.now(),
  };
  browserSessions.set(sessionKey(input.userId), snapshot);
}

export function revokeBrowserWebuiSession(token: string | undefined): void {
  if (!token) {
    return;
  }
  for (const [key, entry] of browserSessions.entries()) {
    if (entry.token === token) {
      browserSessions.delete(key);
    }
  }
}

export function resetBrowserWebuiSessionsForTests(): void {
  browserSessions.clear();
}

/** Latest browser-origin login on this WebUI instance (not desktop client requests). */
export function getLatestBrowserWebuiSession(): BrowserSessionSnapshot | null {
  let latest: BrowserSessionSnapshot | null = null;
  for (const entry of browserSessions.values()) {
    if (!latest || entry.updatedAt > latest.updatedAt) {
      latest = entry;
    }
  }
  return latest;
}

export { ONE_WEBUI_CLIENT_HEADER, ONE_WEBUI_CLIENT_DESKTOP };
