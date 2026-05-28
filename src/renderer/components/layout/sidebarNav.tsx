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
  People,
  Robot,
  Server,
  Setting,
} from '@icon-park/react';

export type NavItem = {
  icon: React.ReactNode;
  labelKey: string;
  labelDefault: string;
  path: string;
  paths?: string[];
  /** 仅企业版工作区显示 */
  enterpriseOnly?: boolean;
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
    labelDefault: 'Tasks',
    path: '/tasks',
  },
  {
    icon: <People theme='outline' size={18} />,
    labelKey: 'nav.enterpriseConsole',
    labelDefault: 'Enterprise',
    path: '/enterprise',
  },
  {
    icon: <Robot theme='outline' size={18} />,
    labelKey: 'nav.superAssistant',
    labelDefault: '超级助手',
    path: '/super-assistant',
  },
  {
    icon: <Lightning theme='outline' size={18} />,
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

export function getSidebarNavItems(hasJoinedEnterprise: boolean, isEnterpriseEdition: boolean): NavItem[] {
  let items = NAV_ITEMS;
  if (!hasJoinedEnterprise) {
    items = items.filter((x) => x.path !== '/enterprise' && x.path !== '/super-assistant');
  }
  if (!isEnterpriseEdition) {
    items = items.filter((x) => !x.enterpriseOnly);
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
    '/super-assistant',
    '/sessions',
    '/enterprise',
    '/scheduled',
  ];
  return !standalonePrefixes.some((prefix) => pathname.startsWith(prefix));
}
