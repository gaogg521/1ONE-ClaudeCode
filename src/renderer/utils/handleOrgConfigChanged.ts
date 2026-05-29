/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OrgConfigChangedPayload } from '@/common/types/orgConfigEvents';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { dispatchWebuiConfigRefresh } from '@/renderer/utils/webuiConfigSync';
import { syncBrowserWebuiSessionToDesktop } from '@/renderer/utils/syncBrowserWebuiSession';

let lastHandledRevision: string | null = null;

export function resetOrgConfigChangedDedupForTests(): void {
  lastHandledRevision = null;
}

/** Apply a server-pushed org config revision (all team clients on this WebUI instance). */
export async function handleOrgConfigChanged(payload: OrgConfigChangedPayload): Promise<void> {
  if (payload.revision && payload.revision === lastHandledRevision) {
    return;
  }
  lastHandledRevision = payload.revision ?? null;

  if (
    payload.scope !== 'login-channels' &&
    payload.scope !== 'auth-providers' &&
    payload.scope !== 'admin-email' &&
    payload.scope !== 'edition-access'
  ) {
    return;
  }

  if (isElectronDesktop()) {
    await syncBrowserWebuiSessionToDesktop();
  }
  dispatchWebuiConfigRefresh();
}
