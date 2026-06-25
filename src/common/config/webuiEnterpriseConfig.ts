/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** How the user manages WebUI-related settings in the app. */
export type WebuiManagementMode = 'standalone' | 'enterprise';

export const DEFAULT_TENANT_ID = 'default';

export const WEBUI_MANAGEMENT_MODE_KEY = 'webui.managementMode' as const;

/** User explicitly chose personal edition; do not auto-switch back to enterprise. */
export const WEBUI_USER_CHOSE_STANDALONE_KEY = 'webui.userChoseStandalone' as const;

export const DEFAULT_WEBUI_MANAGEMENT_MODE: WebuiManagementMode = 'standalone';

/**
 * Enterprise deployment role for this machine:
 * - 'client' (default): a terminal that hosts no enterprise. Points at a remote server
 *   when an address is set; with no address it behaves like a plain personal instance.
 * - 'server': this machine hosts the enterprise (set when the user creates an enterprise).
 * Keeps a single server per LAN: everyone stays a client until they create an enterprise,
 * and demoting a server back to client clears the local enterprise + downgrades system_admin.
 */
export type WebuiDeploymentRole = 'server' | 'client';
export const WEBUI_DEPLOYMENT_ROLE_KEY = 'webui.deploymentRole' as const;
export const WEBUI_ENTERPRISE_SERVER_URL_KEY = 'webui.enterpriseServerUrl' as const;
export const DEFAULT_WEBUI_DEPLOYMENT_ROLE: WebuiDeploymentRole = 'client';

export function normalizeWebuiDeploymentRole(value: unknown): WebuiDeploymentRole {
  return value === 'server' ? 'server' : 'client';
}

/** Normalize a user-entered server address to an origin (prepends http:// when missing). */
export function normalizeEnterpriseServerUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(v) ? v : `http://${v}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

export type EnterpriseContextSnapshot = {
  joined: boolean;
  tenantId: string;
  tenantName: string | null;
  /** 桌面端 IPC 返回本地 WebUI 管理员角色；Web 端通常由 AuthContext.user 提供 */
  role?: string;
  /** True when user may create a new enterprise (system_admin, not yet in a tenant). */
  canCreateEnterprise?: boolean;
  /** Whether any user in this instance already has system_admin. */
  hasSystemAdmin?: boolean;
  /** True when signed-in org_admin may perform one-time bootstrap claim. */
  canClaimSystemAdmin?: boolean;
};

export function normalizeWebuiManagementMode(value: unknown): WebuiManagementMode {
  return value === 'enterprise' ? 'enterprise' : 'standalone';
}

export function isEnterpriseTenantId(tenantId: string | null | undefined): boolean {
  const tid = (tenantId ?? DEFAULT_TENANT_ID).trim();
  return tid !== '' && tid !== DEFAULT_TENANT_ID;
}

/** Browser WebUI: avoid blocking on ConfigStorage/WebSocket before session exists. */
export function readBrowserWebuiManagementMode(): WebuiManagementMode | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    const raw =
      window.sessionStorage.getItem(WEBUI_MANAGEMENT_MODE_KEY) ??
      window.localStorage.getItem(WEBUI_MANAGEMENT_MODE_KEY);
    return raw ? normalizeWebuiManagementMode(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function writeBrowserWebuiManagementMode(mode: WebuiManagementMode): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(WEBUI_MANAGEMENT_MODE_KEY, mode);
    window.localStorage.setItem(WEBUI_MANAGEMENT_MODE_KEY, mode);
  } catch {
    // ignore quota / privacy mode
  }
}

export function hasWebuiSessionCookie(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return /(?:^|;\s*)one-session=/.test(document.cookie);
}
