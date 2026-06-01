/**
 * Shared enterprise admin-console route metadata and access rules.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEnterpriseAdminRole, isSystemAdminRole } from './enterpriseRoles';

export type EnterpriseNavKey =
  | 'home'
  | 'settings'
  | 'users'
  | 'teams'
  | 'auth'
  | 'invites'
  | 'cteam'
  | 'rag'
  | 'mcp'
  | 'skills'
  | 'pipeline-editor'
  | 'milestones'
  | 'cpack'
  | 'ccode'
  | 'cmeas'
  | 'ctest'
  | 'cflow'
  | 'cagent'
  | 'usage'
  | 'security';

export type EnterpriseRouteRole = 'member' | 'admin' | 'system_admin';
export type EnterprisePlatformPolicy = 'all' | 'desktop' | 'browser';

export type EnterpriseRouteMeta = {
  key: EnterpriseNavKey;
  path: string;
  aliases?: string[];
  requiresRole: EnterpriseRouteRole;
  platformPolicy: EnterprisePlatformPolicy;
  visibleInNav?: boolean;
};

export const ENTERPRISE_HOME_PATH = '/enterprise';
export const ENTERPRISE_SETTINGS_PATH = '/enterprise/settings';
export const ENTERPRISE_USERS_PATH = '/enterprise/users';
export const ENTERPRISE_TEAMS_PATH = '/enterprise/teams';
export const ENTERPRISE_AUTH_PATH = '/enterprise/auth';
export const ENTERPRISE_INVITES_PATH = '/enterprise/invites';
export const ENTERPRISE_KANBAN_PATH = '/enterprise/kanban';
export const ENTERPRISE_CTEAM_PATH = '/enterprise/cteam';
export const ENTERPRISE_RAG_PATH = '/enterprise/rag';
export const ENTERPRISE_MCP_PATH = '/enterprise/mcp';
export const ENTERPRISE_SKILLS_PATH = '/enterprise/skills';
export const ENTERPRISE_PIPELINE_EDITOR_PATH = '/enterprise/pipeline-editor';
export const ENTERPRISE_MILESTONES_PATH = '/enterprise/milestones';
export const ENTERPRISE_CPACK_PATH = '/enterprise/cpack';
export const ENTERPRISE_CCODE_PATH = '/enterprise/ccode';
export const ENTERPRISE_CMEAS_PATH = '/enterprise/cmeas';
export const ENTERPRISE_CTEST_PATH = '/enterprise/ctest';
export const ENTERPRISE_CFLOW_PATH = '/enterprise/cflow';
export const ENTERPRISE_CAGENT_PATH = '/enterprise/cagent';
export const ENTERPRISE_USAGE_PATH = '/enterprise/usage';
export const ENTERPRISE_SECURITY_PATH = '/enterprise/security';

export const ENTERPRISE_ROUTE_META: EnterpriseRouteMeta[] = [
  {
    key: 'home',
    path: ENTERPRISE_HOME_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'settings',
    path: ENTERPRISE_SETTINGS_PATH,
    requiresRole: 'admin',
    platformPolicy: 'all',
  },
  {
    key: 'users',
    path: ENTERPRISE_USERS_PATH,
    requiresRole: 'admin',
    platformPolicy: 'all',
  },
  {
    key: 'teams',
    path: ENTERPRISE_TEAMS_PATH,
    requiresRole: 'admin',
    platformPolicy: 'all',
  },
  {
    key: 'auth',
    path: ENTERPRISE_AUTH_PATH,
    requiresRole: 'admin',
    platformPolicy: 'all',
  },
  {
    key: 'invites',
    path: ENTERPRISE_INVITES_PATH,
    requiresRole: 'system_admin',
    platformPolicy: 'all',
  },
  {
    key: 'cteam',
    path: ENTERPRISE_CTEAM_PATH,
    aliases: [ENTERPRISE_KANBAN_PATH],
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'rag',
    path: ENTERPRISE_RAG_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'mcp',
    path: ENTERPRISE_MCP_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'skills',
    path: ENTERPRISE_SKILLS_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'pipeline-editor',
    path: ENTERPRISE_PIPELINE_EDITOR_PATH,
    requiresRole: 'admin',
    platformPolicy: 'all',
    visibleInNav: false,
  },
  {
    key: 'milestones',
    path: ENTERPRISE_MILESTONES_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'cpack',
    path: ENTERPRISE_CPACK_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'ccode',
    path: ENTERPRISE_CCODE_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'cmeas',
    path: ENTERPRISE_CMEAS_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'ctest',
    path: ENTERPRISE_CTEST_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
    visibleInNav: false,
  },
  {
    key: 'cflow',
    path: ENTERPRISE_CFLOW_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
    visibleInNav: false,
  },
  {
    key: 'cagent',
    path: ENTERPRISE_CAGENT_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
    visibleInNav: false,
  },
  {
    key: 'usage',
    path: ENTERPRISE_USAGE_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
  {
    key: 'security',
    path: ENTERPRISE_SECURITY_PATH,
    requiresRole: 'member',
    platformPolicy: 'all',
  },
];

function matchesPathPrefix(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function canAccessEnterpriseRouteRole(
  requiredRole: EnterpriseRouteRole,
  role: string | undefined
): boolean {
  if (requiredRole === 'member') {
    return Boolean(role);
  }
  if (requiredRole === 'system_admin') {
    return isSystemAdminRole(role);
  }
  return isEnterpriseAdminRole(role);
}

export function canAccessEnterprisePlatform(
  platformPolicy: EnterprisePlatformPolicy,
  isDesktop: boolean
): boolean {
  if (platformPolicy === 'all') {
    return true;
  }
  if (platformPolicy === 'desktop') {
    return isDesktop;
  }
  return !isDesktop;
}

export function getEnterpriseRouteMetaByKey(
  key: EnterpriseNavKey
): EnterpriseRouteMeta | undefined {
  return ENTERPRISE_ROUTE_META.find((route) => route.key === key);
}

export function getEnterpriseRouteMetaByPath(
  pathname: string
): EnterpriseRouteMeta | undefined {
  let matched: EnterpriseRouteMeta | undefined;
  let matchedLength = -1;

  for (const route of ENTERPRISE_ROUTE_META) {
    for (const candidate of [route.path, ...(route.aliases ?? [])]) {
      if (matchesPathPrefix(pathname, candidate) && candidate.length > matchedLength) {
        matched = route;
        matchedLength = candidate.length;
      }
    }
  }

  return matched;
}

export function enterpriseNavKeyFromPath(pathname: string): EnterpriseNavKey {
  return getEnterpriseRouteMetaByPath(pathname)?.key ?? 'home';
}

export function canAccessEnterpriseRoute(
  route: EnterpriseRouteMeta,
  role: string | undefined,
  isDesktop: boolean
): boolean {
  return (
    canAccessEnterpriseRouteRole(route.requiresRole, role) &&
    canAccessEnterprisePlatform(route.platformPolicy, isDesktop)
  );
}

export function getVisibleEnterpriseNavKeys(
  role: string | undefined,
  isDesktop: boolean
): EnterpriseNavKey[] {
  return ENTERPRISE_ROUTE_META.filter(
    (route) => route.visibleInNav !== false && canAccessEnterpriseRoute(route, role, isDesktop)
  ).map((route) => route.key);
}
