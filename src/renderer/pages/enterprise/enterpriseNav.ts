/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ENTERPRISE_AUTH_PATH,
  ENTERPRISE_CCODE_PATH,
  ENTERPRISE_CFLOW_PATH,
  ENTERPRISE_CMEAS_PATH,
  ENTERPRISE_CPACK_PATH,
  ENTERPRISE_CTEST_PATH,
  ENTERPRISE_HOME_PATH,
  ENTERPRISE_INVITES_PATH,
  ENTERPRISE_MCP_PATH,
  ENTERPRISE_MILESTONES_PATH,
  ENTERPRISE_PIPELINE_EDITOR_PATH,
  ENTERPRISE_RAG_PATH,
  ENTERPRISE_SECURITY_PATH,
  ENTERPRISE_SKILLS_PATH,
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
    key: 'rag',
    path: ENTERPRISE_RAG_PATH,
    labelKey: 'settings.enterpriseConsole.navRagConfig',
    labelDefault: '知识库配置',
    requiresElevation: true,
  },
  {
    key: 'mcp',
    path: ENTERPRISE_MCP_PATH,
    labelKey: 'settings.enterpriseConsole.navMcpConfig',
    labelDefault: 'MCP 外部集成',
    requiresElevation: true,
  },
  {
    key: 'skills',
    path: ENTERPRISE_SKILLS_PATH,
    labelKey: 'settings.enterpriseConsole.navSkills',
    labelDefault: 'Skills 技能仓库',
    requiresElevation: true,
  },
  {
    key: 'pipeline-editor',
    path: ENTERPRISE_PIPELINE_EDITOR_PATH,
    labelKey: 'admin.pipeline.navEditor',
    labelDefault: '流水线编排器',
    requiresElevation: true,
  },
  {
    key: 'milestones',
    path: ENTERPRISE_MILESTONES_PATH,
    labelKey: 'admin.milestones.nav',
    labelDefault: '版本规划',
    requiresElevation: false,
  },
  {
    key: 'cpack',
    path: ENTERPRISE_CPACK_PATH,
    labelKey: 'admin.cpack.nav',
    labelDefault: '制品仓库',
    requiresElevation: true,
  },
  {
    key: 'ccode',
    path: ENTERPRISE_CCODE_PATH,
    labelKey: 'admin.ccode.nav',
    labelDefault: '代码库',
    requiresElevation: true,
  },
  {
    key: 'cmeas',
    path: ENTERPRISE_CMEAS_PATH,
    labelKey: 'admin.cmeas.nav',
    labelDefault: '效能洞察',
    requiresElevation: true,
  },
  {
    key: 'ctest',
    path: ENTERPRISE_CTEST_PATH,
    labelKey: 'admin.ctest.nav',
    labelDefault: '测试管理',
    requiresElevation: true,
  },
  {
    key: 'cflow',
    path: ENTERPRISE_CFLOW_PATH,
    labelKey: 'admin.cflow.nav',
    labelDefault: '价值流',
    requiresElevation: true,
  },
  {
    key: 'usage',
    path: ENTERPRISE_USAGE_PATH,
    labelKey: 'settings.enterpriseConsole.navUsage',
    labelDefault: '使用统计',
    requiresElevation: false,
  },
  {
    key: 'security',
    path: ENTERPRISE_SECURITY_PATH,
    labelKey: 'settings.enterpriseConsole.navSecurity',
    labelDefault: '安全与审计',
    requiresElevation: false,
  },
];

export function enterpriseNavKeyFromPath(pathname: string): EnterpriseNavKey {
  if (pathname.startsWith(ENTERPRISE_TEAMS_PATH)) return 'teams';
  if (pathname.startsWith(ENTERPRISE_AUTH_PATH)) return 'auth';
  if (pathname.startsWith(ENTERPRISE_INVITES_PATH)) return 'invites';
  if (pathname.startsWith(ENTERPRISE_RAG_PATH)) return 'rag';
  if (pathname.startsWith(ENTERPRISE_MCP_PATH)) return 'mcp';
  if (pathname.startsWith(ENTERPRISE_SKILLS_PATH)) return 'skills';
  if (pathname.startsWith(ENTERPRISE_PIPELINE_EDITOR_PATH)) return 'pipeline-editor';
  if (pathname.startsWith(ENTERPRISE_MILESTONES_PATH)) return 'milestones';
  if (pathname.startsWith(ENTERPRISE_CPACK_PATH)) return 'cpack';
  if (pathname.startsWith(ENTERPRISE_CCODE_PATH)) return 'ccode';
  if (pathname.startsWith(ENTERPRISE_CMEAS_PATH)) return 'cmeas';
  if (pathname.startsWith(ENTERPRISE_CTEST_PATH)) return 'ctest';
  if (pathname.startsWith(ENTERPRISE_CFLOW_PATH)) return 'cflow';
  if (pathname.startsWith(ENTERPRISE_USAGE_PATH)) return 'usage';
  if (pathname.startsWith(ENTERPRISE_SECURITY_PATH)) return 'security';
  if (pathname.startsWith(ENTERPRISE_USERS_PATH)) return 'users';
  return 'home';
}
