/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ENTERPRISE_JOIN_PATH,
  ENTERPRISE_WORKSPACE_PATH,
} from '@/common/auth/enterpriseRoles';
import {
  ENTERPRISE_AUTH_PATH,
  ENTERPRISE_CCODE_PATH,
  ENTERPRISE_CMEAS_PATH,
  ENTERPRISE_CPACK_PATH,
  ENTERPRISE_CTEAM_PATH,
  ENTERPRISE_HOME_PATH,
  ENTERPRISE_INVITES_PATH,
  ENTERPRISE_KANBAN_PATH,
  ENTERPRISE_MCP_PATH,
  ENTERPRISE_MILESTONES_PATH,
  ENTERPRISE_PIPELINE_EDITOR_PATH,
  ENTERPRISE_RAG_PATH,
  ENTERPRISE_SECURITY_PATH,
  ENTERPRISE_SKILLS_PATH,
  ENTERPRISE_TEAMS_PATH,
  ENTERPRISE_USAGE_PATH,
  ENTERPRISE_USERS_PATH,
} from '@/common/auth/enterpriseRoutes';

export { ENTERPRISE_JOIN_PATH, ENTERPRISE_WORKSPACE_PATH };
export {
  ENTERPRISE_AUTH_PATH,
  ENTERPRISE_CCODE_PATH,
  ENTERPRISE_CMEAS_PATH,
  ENTERPRISE_CPACK_PATH,
  ENTERPRISE_CTEAM_PATH,
  ENTERPRISE_HOME_PATH,
  ENTERPRISE_INVITES_PATH,
  ENTERPRISE_KANBAN_PATH,
  ENTERPRISE_MCP_PATH,
  ENTERPRISE_MILESTONES_PATH,
  ENTERPRISE_PIPELINE_EDITOR_PATH,
  ENTERPRISE_RAG_PATH,
  ENTERPRISE_SECURITY_PATH,
  ENTERPRISE_SKILLS_PATH,
  ENTERPRISE_TEAMS_PATH,
  ENTERPRISE_USAGE_PATH,
  ENTERPRISE_USERS_PATH,
};

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
