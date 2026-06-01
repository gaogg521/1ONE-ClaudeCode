/**
 * Organization / instance config change events (WebSocket + IPC).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoginChannelProvider } from '@/common/types/loginChannels';

export const WEBUI_ORG_CONFIG_CHANGED_EVENT = 'webui.org-config-changed';

/** Instance-wide login / SSO / mail settings (all channels). */
export type OrgConfigScope = 'login-channels' | 'admin-email' | 'edition-access' | 'enterprise-profile';

/** @deprecated Use login-channels */
export type LegacyOrgConfigScope = 'auth-providers';

export type OrgConfigChangedPayload = {
  scope: OrgConfigScope | LegacyOrgConfigScope;
  /** Admin tenant when the change was made; login config applies to the whole WebUI instance. */
  tenantId: string;
  provider?: LoginChannelProvider | string;
  updatedAt: number;
  /** Dedup id for clients that already handled a local save. */
  revision: string;
};
