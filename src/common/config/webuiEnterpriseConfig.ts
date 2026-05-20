/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** How the user manages WebUI-related settings in the app. */
export type WebuiManagementMode = 'standalone' | 'enterprise';

export const DEFAULT_TENANT_ID = 'default';

export const WEBUI_MANAGEMENT_MODE_KEY = 'webui.managementMode' as const;

export const DEFAULT_WEBUI_MANAGEMENT_MODE: WebuiManagementMode = 'standalone';

export type EnterpriseContextSnapshot = {
  joined: boolean;
  tenantId: string;
  tenantName: string | null;
  /** True when user may create a new enterprise (system_admin, not yet in a tenant). */
  canCreateEnterprise?: boolean;
};

export function normalizeWebuiManagementMode(value: unknown): WebuiManagementMode {
  return value === 'enterprise' ? 'enterprise' : 'standalone';
}

export function isEnterpriseTenantId(tenantId: string | null | undefined): boolean {
  const tid = (tenantId ?? DEFAULT_TENANT_ID).trim();
  return tid !== '' && tid !== DEFAULT_TENANT_ID;
}
