/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { mergeDesktopEnterpriseContext } from '@/common/auth/enterpriseEditionSync';
import { isEnterpriseAdminConsolePath } from '@/renderer/pages/enterprise/paths';

describe('mergeDesktopEnterpriseContext', () => {
  it('keeps local org_admin when browser session is a member', () => {
    const merged = mergeDesktopEnterpriseContext(
      {
        joined: true,
        tenantId: 't1',
        tenantName: 'Acme',
        role: 'org_admin',
      },
      {
        joined: true,
        tenantId: 't1',
        tenantName: 'Acme',
        role: 'member',
      }
    );
    expect(merged.role).toBe('org_admin');
    expect(merged.joined).toBe(true);
  });

  it('uses browser tenant when only browser joined', () => {
    const merged = mergeDesktopEnterpriseContext(
      { joined: false, tenantId: 'default', tenantName: null },
      { joined: true, tenantId: 't2', tenantName: 'Beta', role: 'member' }
    );
    expect(merged.tenantId).toBe('t2');
    expect(merged.joined).toBe(true);
  });
});

describe('isEnterpriseAdminConsolePath', () => {
  it('excludes join path from admin console', () => {
    expect(isEnterpriseAdminConsolePath('/enterprise/join')).toBe(false);
    expect(isEnterpriseAdminConsolePath('/enterprise')).toBe(true);
  });
});
