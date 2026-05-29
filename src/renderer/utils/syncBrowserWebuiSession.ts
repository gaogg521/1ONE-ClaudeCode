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

export async function syncBrowserWebuiSessionToDesktop(): Promise<WebuiDesktopSession | null> {
  if (!isElectronDesktop()) {
    return getWebuiDesktopSession();
  }

  try {
    const result = await webui.syncBrowserWebuiSession.invoke();
    if (result.success && result.data?.token) {
      const next: WebuiDesktopSession = {
        userId: result.data.userId,
        username: result.data.username,
        role: result.data.role,
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
