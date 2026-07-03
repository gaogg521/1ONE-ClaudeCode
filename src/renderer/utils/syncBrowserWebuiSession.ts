/**
 * Sync browser WebUI login → desktop renderer session (no second login).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  getWebuiDesktopSession,
  setWebuiDesktopSession,
  type WebuiDesktopSession,
} from '@/renderer/utils/webuiDesktopSession';

// WebuiService.syncBrowserWebuiSession() (main process) awaits session.defaultSession.cookies.get()
// and DB lookups with no internal timeout — WebuiService.handleAsync only catches thrown errors,
// not hangs. ensureDesktopWebuiRunning() awaits this call directly before every Issues create/update
// request, so an unresolved promise here blocks the whole action forever with the main process event
// loop otherwise healthy (no console.* involved — confirmed via logs/webui-requests.log staying empty
// while tray/IPC kept responding). Race against a timeout so a hang degrades to the cached session
// instead of hanging the caller indefinitely.
const SYNC_BROWSER_SESSION_TIMEOUT_MS = 8_000;

export async function syncBrowserWebuiSessionToDesktop(): Promise<WebuiDesktopSession | null> {
  if (!isElectronDesktop()) {
    return getWebuiDesktopSession();
  }

  try {
    const result = await Promise.race([
      webui.syncBrowserWebuiSession.invoke(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SYNC_BROWSER_SESSION_TIMEOUT')), SYNC_BROWSER_SESSION_TIMEOUT_MS);
      }),
    ]);
    if (result.success && result.data?.token) {
      const next: WebuiDesktopSession = {
        userId: result.data.userId,
        username: result.data.username,
        role: result.data.role,
        tenant_id: result.data.tenant_id,
        token: result.data.token,
      };
      setWebuiDesktopSession(next);
      return next;
    }
  } catch {
    // WebUI not running or no browser session yet
  }

  return getWebuiDesktopSession();
}

/** Bearer from browser-synced session (any role). */
export function getDesktopWebuiBearerToken(): string | null {
  return getWebuiDesktopSession()?.token ?? null;
}
