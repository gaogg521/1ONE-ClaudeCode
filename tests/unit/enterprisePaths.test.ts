/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ENTERPRISE_NAV_ITEMS,
  enterpriseNavKeyFromPath,
  getVisibleEnterpriseNavItems,
} from '@/renderer/pages/enterprise/enterpriseNav';
import {
  ENTERPRISE_HOME_PATH,
  isEnterpriseConsolePath,
  isLegacyEnterprisePath,
  LEGACY_ENTERPRISE_PREFIX,
} from '@/renderer/pages/enterprise/paths';

describe('enterprise paths', () => {
  it('detects enterprise console routes', () => {
    expect(isEnterpriseConsolePath('/enterprise')).toBe(true);
    expect(isEnterpriseConsolePath('/enterprise/users')).toBe(true);
    expect(isEnterpriseConsolePath('/settings/webui')).toBe(false);
    expect(isEnterpriseConsolePath('/sessions')).toBe(false);
  });

  it('detects legacy enterprise settings routes', () => {
    expect(isLegacyEnterprisePath('/settings/enterprise')).toBe(true);
    expect(isLegacyEnterprisePath('/settings/enterprise/users')).toBe(true);
    expect(isLegacyEnterprisePath(LEGACY_ENTERPRISE_PREFIX)).toBe(true);
    expect(isLegacyEnterprisePath('/enterprise')).toBe(false);
  });

  it('maps pathname to nav keys', () => {
    expect(enterpriseNavKeyFromPath('/enterprise')).toBe('home');
    expect(enterpriseNavKeyFromPath(ENTERPRISE_HOME_PATH)).toBe('home');
    expect(enterpriseNavKeyFromPath('/enterprise/users')).toBe('users');
    expect(enterpriseNavKeyFromPath('/enterprise/auth')).toBe('auth');
    expect(enterpriseNavKeyFromPath('/enterprise/teams')).toBe('teams');
    expect(enterpriseNavKeyFromPath('/enterprise/invites')).toBe('invites');
    expect(enterpriseNavKeyFromPath('/enterprise/kanban')).toBe('cteam');
  });

  it('filters nav items by current role', () => {
    expect(getVisibleEnterpriseNavItems('member', false).map((item) => item.key)).toEqual([
      'home',
      'users',
      'cagent',
    ]);

    expect(getVisibleEnterpriseNavItems('org_admin', false).map((item) => item.key)).toContain(
      'teams'
    );
  });

  it('does not require secondary verification for enterprise navigation items', () => {
    expect(ENTERPRISE_NAV_ITEMS.every((item) => item.requiresElevation === false)).toBe(true);
  });
});
