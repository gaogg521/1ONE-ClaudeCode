/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const ENTERPRISE_HOME_PATH = '/enterprise';
export const ENTERPRISE_USERS_PATH = '/enterprise/users';
export const ENTERPRISE_TEAMS_PATH = '/enterprise/teams';
export const ENTERPRISE_AUTH_PATH = '/enterprise/auth';
export const ENTERPRISE_INVITES_PATH = '/enterprise/invites';
export const ENTERPRISE_USAGE_PATH = '/enterprise/usage';
export const ENTERPRISE_SECURITY_PATH = '/enterprise/security';

/** Legacy settings-scoped enterprise URLs (redirect targets). */
export const LEGACY_ENTERPRISE_PREFIX = '/settings/enterprise';

export function isEnterpriseConsolePath(pathname: string): boolean {
  return pathname === ENTERPRISE_HOME_PATH || pathname.startsWith(`${ENTERPRISE_HOME_PATH}/`);
}

export function isLegacyEnterprisePath(pathname: string): boolean {
  return pathname === LEGACY_ENTERPRISE_PREFIX || pathname.startsWith(`${LEGACY_ENTERPRISE_PREFIX}/`);
}
