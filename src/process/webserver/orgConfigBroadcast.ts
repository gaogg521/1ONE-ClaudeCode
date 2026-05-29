/**
 * Broadcast org/instance config changes to all connected clients (browser WS + desktop IPC).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { webui } from '@/common/adapter/ipcBridge';
import type { OrgConfigChangedPayload, OrgConfigScope } from '@/common/types/orgConfigEvents';
import type { LoginChannelProvider } from '@/common/types/loginChannels';

export function publishOrgConfigChanged(input: {
  scope: OrgConfigScope;
  tenantId: string;
  provider?: LoginChannelProvider | string;
}): OrgConfigChangedPayload {
  const payload: OrgConfigChangedPayload = {
    scope: input.scope,
    tenantId: input.tenantId,
    provider: input.provider,
    updatedAt: Date.now(),
    revision: randomUUID(),
  };
  webui.orgConfigChanged.emit(payload);
  return payload;
}

export function publishLoginChannelsChanged(input: {
  tenantId: string;
  provider: LoginChannelProvider | string;
}): OrgConfigChangedPayload {
  return publishOrgConfigChanged({
    scope: 'login-channels',
    tenantId: input.tenantId,
    provider: input.provider,
  });
}
