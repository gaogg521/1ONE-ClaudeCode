/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ENTERPRISE_AUTH_PATH,
  ENTERPRISE_HOME_PATH,
  ENTERPRISE_INVITES_PATH,
  ENTERPRISE_SECURITY_PATH,
  ENTERPRISE_TEAMS_PATH,
  ENTERPRISE_USAGE_PATH,
  ENTERPRISE_USERS_PATH,
} from '@/renderer/pages/enterprise/paths';

export type EnterpriseNavKey =
  | 'home'
  | 'users'
  | 'teams'
  | 'auth'
  | 'invites'
  | 'usage'
  | 'security';

export type EnterpriseNavItem = {
  key: EnterpriseNavKey;
  path: string;
  labelKey: string;
  labelDefault: string;
  requiresElevation: boolean;
  comingSoon?: boolean;
};

export const ENTERPRISE_NAV_ITEMS: EnterpriseNavItem[] = [
  {
    key: 'home',
    path: ENTERPRISE_HOME_PATH,
    labelKey: 'settings.enterpriseConsole.navHome',
    labelDefault: '概览',
    requiresElevation: false,
  },
  {
    key: 'users',
    path: ENTERPRISE_USERS_PATH,
    labelKey: 'settings.enterpriseConsole.navUsers',
    labelDefault: '用户与成员',
    requiresElevation: false,
  },
  {
    key: 'teams',
    path: ENTERPRISE_TEAMS_PATH,
    labelKey: 'settings.enterpriseConsole.navTeams',
    labelDefault: '团队与组织',
    requiresElevation: true,
  },
  {
    key: 'auth',
    path: ENTERPRISE_AUTH_PATH,
    labelKey: 'settings.enterpriseConsole.navAuth',
    labelDefault: '认证与邮件',
    requiresElevation: true,
  },
  {
    key: 'invites',
    path: ENTERPRISE_INVITES_PATH,
    labelKey: 'settings.enterpriseConsole.navInvites',
    labelDefault: '邀请码',
    requiresElevation: true,
  },
  {
    key: 'usage',
    path: ENTERPRISE_USAGE_PATH,
    labelKey: 'settings.enterpriseConsole.navUsage',
    labelDefault: '使用统计',
    requiresElevation: true,
    comingSoon: true,
  },
  {
    key: 'security',
    path: ENTERPRISE_SECURITY_PATH,
    labelKey: 'settings.enterpriseConsole.navSecurity',
    labelDefault: '安全与审计',
    requiresElevation: true,
    comingSoon: true,
  },
];

export function enterpriseNavKeyFromPath(pathname: string): EnterpriseNavKey {
  if (pathname.startsWith(ENTERPRISE_TEAMS_PATH)) return 'teams';
  if (pathname.startsWith(ENTERPRISE_AUTH_PATH)) return 'auth';
  if (pathname.startsWith(ENTERPRISE_INVITES_PATH)) return 'invites';
  if (pathname.startsWith(ENTERPRISE_USAGE_PATH)) return 'usage';
  if (pathname.startsWith(ENTERPRISE_SECURITY_PATH)) return 'security';
  if (pathname.startsWith(ENTERPRISE_USERS_PATH)) return 'users';
  return 'home';
}
