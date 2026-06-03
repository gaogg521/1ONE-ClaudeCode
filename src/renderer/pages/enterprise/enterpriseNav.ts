/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ENTERPRISE_ROUTE_META,
  enterpriseNavKeyFromPath,
  getEnterpriseRouteMetaByKey,
  getEnterpriseRouteMetaByPath,
  getVisibleEnterpriseNavKeys,
  type EnterpriseNavKey,
  type EnterprisePlatformPolicy,
  type EnterpriseRouteRole,
} from '@/common/auth/enterpriseRoutes';

export type EnterpriseNavItem = {
  key: EnterpriseNavKey;
  path: string;
  labelKey: string;
  labelDefault: string;
  requiresRole: EnterpriseRouteRole;
  platformPolicy: EnterprisePlatformPolicy;
  comingSoon?: boolean;
};

const NAV_LABELS: Record<
  EnterpriseNavKey,
  Pick<EnterpriseNavItem, 'labelKey' | 'labelDefault' | 'comingSoon'>
> = {
  home: { labelKey: 'settings.enterpriseConsole.navHome', labelDefault: '概览' },
  settings: { labelKey: 'settings.enterpriseConsole.navSettings', labelDefault: '企业设置' },
  users: { labelKey: 'settings.enterpriseConsole.navUsers', labelDefault: '用户管理' },
  teams: { labelKey: 'settings.enterpriseConsole.navTeams', labelDefault: '团队与组织' },
  runtimes: { labelKey: 'admin.teamRuntimes.nav', labelDefault: '团队运行时' },
  auth: { labelKey: 'settings.enterpriseConsole.navAuth', labelDefault: '企业认证' },
  invites: { labelKey: 'settings.enterpriseConsole.navInvites', labelDefault: '邀请码' },
  cteam: { labelKey: 'admin.cteam.nav', labelDefault: 'Issues 规划看板' },
  rag: { labelKey: 'settings.enterpriseConsole.navRagConfig', labelDefault: '团队知识库' },
  mcp: { labelKey: 'settings.enterpriseConsole.navMcpConfig', labelDefault: '团队 MCP 工具' },
  skills: { labelKey: 'settings.enterpriseConsole.navSkills', labelDefault: '团队 Skills 后台' },
  'pipeline-editor': { labelKey: 'admin.pipeline.navEditor', labelDefault: '流水线编排器' },
  milestones: { labelKey: 'admin.milestones.nav', labelDefault: '版本规划' },
  cpack: { labelKey: 'admin.cpack.nav', labelDefault: '制品仓库' },
  ccode: { labelKey: 'admin.ccode.nav', labelDefault: '代码库' },
  cmeas: { labelKey: 'admin.cmeas.nav', labelDefault: '效能洞察' },
  ctest: { labelKey: 'admin.ctest.nav', labelDefault: '测试管理' },
  cflow: { labelKey: 'admin.cflow.nav', labelDefault: '价值流' },
  cagent: { labelKey: 'admin.cagent.nav', labelDefault: 'Agent 助手' },
  usage: { labelKey: 'settings.enterpriseConsole.navUsage', labelDefault: '使用统计' },
  security: { labelKey: 'settings.enterpriseConsole.navSecurity', labelDefault: '安全与审计' },
};

function toNavItem(key: EnterpriseNavKey): EnterpriseNavItem {
  const route = getEnterpriseRouteMetaByKey(key);
  if (!route) {
    throw new Error(`Unknown enterprise nav key: ${key}`);
  }
  return {
    key,
    path: route.path,
    requiresRole: route.requiresRole,
    platformPolicy: route.platformPolicy,
    ...NAV_LABELS[key],
  };
}

export const ENTERPRISE_NAV_ITEMS: EnterpriseNavItem[] = ENTERPRISE_ROUTE_META
  .filter((route) => route.visibleInNav !== false)
  .map((route) => toNavItem(route.key));

export function getEnterpriseNavItemByKey(
  key: EnterpriseNavKey
): EnterpriseNavItem | undefined {
  return getEnterpriseRouteMetaByKey(key) ? toNavItem(key) : undefined;
}

export function getEnterpriseNavItemByPath(
  pathname: string
): EnterpriseNavItem | undefined {
  const route = getEnterpriseRouteMetaByPath(pathname);
  return route ? toNavItem(route.key) : undefined;
}

export function getVisibleEnterpriseNavItems(
  role: string | undefined,
  isDesktop: boolean
): EnterpriseNavItem[] {
  return getVisibleEnterpriseNavKeys(role, isDesktop).map((key) => toNavItem(key));
}

export { enterpriseNavKeyFromPath };
export type { EnterpriseNavKey };
