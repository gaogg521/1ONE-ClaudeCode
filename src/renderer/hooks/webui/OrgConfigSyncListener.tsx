/**
 * Subscribes to server-pushed org config changes (WebSocket in browser, IPC on desktop).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { webui } from '@/common/adapter/ipcBridge';
import type { OrgConfigChangedPayload } from '@/common/types/orgConfigEvents';
import { handleOrgConfigChanged } from '@/renderer/utils/handleOrgConfigChanged';

export function OrgConfigSyncListener(): null {
  useEffect(() => {
    const unsubscribe = webui.orgConfigChanged.on((payload: OrgConfigChangedPayload) => {
      void handleOrgConfigChanged(payload);
    });
    return unsubscribe;
  }, []);

  return null;
}
