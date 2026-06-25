/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AlarmClock,
  Brain,
  Checklist,
  CommentOne,
  FolderOpen,
  Lightning,
  Link,
  NetworkDrive,
  People,
  Robot,
  Server,
  Setting,
} from '@icon-park/react';
import type { EditionCapability } from '@/common/auth/identityPolicy';

export type NavItem = {
  icon: React.ReactNode;
  labelKey: string;
  labelDefault: string;
  path: string;
  paths?: string[];
  capability?: EditionCapability;
  hidden?: boolean;
};

export type SidebarNavGate = {
  can: (capability: EditionCapability) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    icon: <CommentOne theme='outline' size={18} />,
    labelKey: 'nav.sessions',
    labelDefault: 'Sessions',
    path: '/sessions',
    paths: ['/conversation', '/guid', '/team'],
  },
  {
    icon: <FolderOpen theme='outline' size={18} />,
    labelKey: 'nav.workspace',
    labelDefault: 'Workspace',
    path: '/workspace',
  },
  {
    icon: <Checklist theme='outline' size={18} />,
    labelKey: 'nav.tasks',
    labelDefault: '任务看板',
    path: '/tasks',
  },
  {
    icon: <Checklist theme='outline' size={18} />,
    labelKey: 'nav.issues',
    labelDefault: 'Issues',
    path: '/issues',
    paths: ['/enterprise/cteam', '/enterprise/kanban'],
  },
  {
    icon: <Robot theme='outline' size={18} />,
    labelKey: 'nav.agentAssistant',
    labelDefault: '超级助手',
    path: '/super-assistant',
  },
  {
    icon: <NetworkDrive theme='outline' size={18} />,
    labelKey: 'nav.agentFleet',
    labelDefault: '组织节点',
    path: '/agent-fleet',
    capability: 'enterprise.workspace',
  },
  {
    icon: <Lightning theme='outline' size={18} />,
    labelKey: 'nav.skills',
    labelDefault: 'Skills',
    path: '/skills',
    paths: ['/enterprise/skills'],
  },
  {
    icon: <People theme='outline' size={18} />,
    labelKey: 'nav.enterpriseConsole',
    labelDefault: '企业后台',
    path: '/enterprise',
    capability: 'admin.console',
    hidden: true,
  },
  {
    icon: <Link theme='outline' size={18} />,
    labelKey: 'nav.hooks',
    labelDefault: 'Hooks',
    path: '/hooks',
  },
  {
    icon: <Server theme='outline' size={18} />,
    labelKey: 'nav.mcp',
    labelDefault: 'MCP',
    path: '/mcp',
  },
  {
    icon: <Brain theme='outline' size={18} />,
    labelKey: 'nav.memory',
    labelDefault: 'Memory',
    path: '/memory',
  },
  {
    icon: <AlarmClock theme='outline' size={18} />,
    labelKey: 'nav.scheduled',
    labelDefault: 'Scheduled',
    path: '/scheduled',
  },
  {
    icon: <Setting theme='outline' size={18} />,
    labelKey: 'nav.globalSettings',
    labelDefault: 'Settings',
    path: '/settings',
  },
];

export function getSidebarNavItems(gate: SidebarNavGate): NavItem[] {
  let items = NAV_ITEMS.filter((item) => !item.capability || gate.can(item.capability));
  if (gate.can('issues.teamPlanning')) {
    // 企业团队版：需求看板与任务看板合并到 Issues，避免侧栏重复入口。
    // 同时把 /tasks 并入 Issues 的匹配路径，这样在 /tasks 路由时 Issues 项仍会高亮。
    items = items
      .filter((x) => x.path !== '/tasks')
      .map((x) => (x.path === '/issues' ? { ...x, paths: [...(x.paths ?? []), '/tasks'] } : x));
  }
  return items;
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const allPaths = [item.path, ...(item.paths ?? [])];
  return allPaths.some((p) => pathname.startsWith(p));
}

/** Routes that show chat sidebar actions (new chat + teams) — history lives in /sessions. */
export function shouldShowSessionSidebarContent(pathname: string): boolean {
  if (pathname.startsWith('/settings')) {
    return false;
  }
  const standalonePrefixes = [
    '/workspace',
    '/tasks',
    '/hooks',
    '/mcp',
    '/memory',
    '/issues',
    '/skills',
    '/super-assistant',
    '/agent-fleet',
    '/sessions',
    '/enterprise',
    '/scheduled',
  ];
  return !standalonePrefixes.some((prefix) => pathname.startsWith(prefix));
}
