/**
 * Enterprise WebUI RBAC — shared by renderer and main process.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const ENTERPRISE_JOIN_PATH = '/enterprise/join';
export const ENTERPRISE_ADMIN_HOME_PATH = '/enterprise';
export const ENTERPRISE_WORKSPACE_PATH = '/sessions';

export function isEnterpriseAdminRole(role: string | undefined): boolean {
  return role === 'system_admin' || role === 'org_admin' || role === 'admin';
}

export function isEnterpriseElevatableRole(role: string | undefined): boolean {
  return isEnterpriseAdminRole(role);
}

export function isSystemAdminRole(role: string | undefined): boolean {
  return role === 'system_admin';
}

export function hasEnterpriseTenant(tenantId: string | undefined): boolean {
  return Boolean(tenantId && tenantId.trim() !== '' && tenantId !== 'default');
}

/**
 * 个人版 ↔ 企业版（工作区）切换后的落点 — 所有已加入成员（含管理员）均进工作区。
 */
export function resolveEnterpriseEditionPath(hasJoinedEnterprise: boolean): string {
  return hasJoinedEnterprise ? ENTERPRISE_WORKSPACE_PATH : ENTERPRISE_JOIN_PATH;
}

/** 组织管理后台（LDAP/邀请码/成员等），与版本切换无关。 */
export function resolveEnterpriseAdminPath(): string {
  return ENTERPRISE_ADMIN_HOME_PATH;
}

/**
 * 登录后 redirect 解析：/enterprise* 不再默认进管理后台。
 */
export function resolvePostLoginRedirectPath(
  rawTarget: string,
  role: string | undefined,
  tenantId: string | undefined
): string {
  const joined = hasEnterpriseTenant(tenantId);
  if (rawTarget === ENTERPRISE_JOIN_PATH || rawTarget.startsWith(`${ENTERPRISE_JOIN_PATH}/`)) {
    return joined ? ENTERPRISE_WORKSPACE_PATH : ENTERPRISE_JOIN_PATH;
  }
  if (rawTarget === ENTERPRISE_ADMIN_HOME_PATH || rawTarget.startsWith(`${ENTERPRISE_ADMIN_HOME_PATH}/`)) {
    if (!joined) return ENTERPRISE_JOIN_PATH;
    if (!isEnterpriseAdminRole(role)) return ENTERPRISE_WORKSPACE_PATH;
    return rawTarget;
  }
  return rawTarget;
}
