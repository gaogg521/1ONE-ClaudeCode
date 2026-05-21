/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ENTERPRISE_ADMIN_HOME_PATH,
  ENTERPRISE_JOIN_PATH,
  ENTERPRISE_WORKSPACE_PATH,
} from '@/common/auth/enterpriseRoles';

export { ENTERPRISE_JOIN_PATH, ENTERPRISE_WORKSPACE_PATH };

/** 组织管理后台首页 */
export const ENTERPRISE_HOME_PATH = ENTERPRISE_ADMIN_HOME_PATH;

export const ENTERPRISE_USERS_PATH = '/enterprise/users';
export const ENTERPRISE_TEAMS_PATH = '/enterprise/teams';
export const ENTERPRISE_AUTH_PATH = '/enterprise/auth';
export const ENTERPRISE_INVITES_PATH = '/enterprise/invites';
export const ENTERPRISE_USAGE_PATH = '/enterprise/usage';
export const ENTERPRISE_SECURITY_PATH = '/enterprise/security';

/** Legacy settings-scoped enterprise URLs (redirect targets). */
export const LEGACY_ENTERPRISE_PREFIX = '/settings/enterprise';

export function isEnterpriseJoinPath(pathname: string): boolean {
  return pathname === ENTERPRISE_JOIN_PATH || pathname.startsWith(`${ENTERPRISE_JOIN_PATH}/`);
}

/** 组织管理后台路径（不含 /enterprise/join） */
export function isEnterpriseAdminConsolePath(pathname: string): boolean {
  if (isEnterpriseJoinPath(pathname)) return false;
  return pathname === ENTERPRISE_HOME_PATH || pathname.startsWith(`${ENTERPRISE_HOME_PATH}/`);
}

/** @deprecated Use isEnterpriseAdminConsolePath */
export function isEnterpriseConsolePath(pathname: string): boolean {
  return isEnterpriseAdminConsolePath(pathname);
}

export function isLegacyEnterprisePath(pathname: string): boolean {
  return pathname === LEGACY_ENTERPRISE_PREFIX || pathname.startsWith(`${LEGACY_ENTERPRISE_PREFIX}/`);
}
