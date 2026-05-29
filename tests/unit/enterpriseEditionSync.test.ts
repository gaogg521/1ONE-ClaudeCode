/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { mergeDesktopEnterpriseContext } from '@/common/auth/enterpriseEditionSync';
import { isEnterpriseAdminConsolePath } from '@/renderer/pages/enterprise/paths';

describe('mergeDesktopEnterpriseContext', () => {
  it('prefers browser session when present', () => {
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
    expect(merged.role).toBe('member');
    expect(merged.joined).toBe(true);
  });

  it('falls back to ipc when browser has no session', () => {
    const merged = mergeDesktopEnterpriseContext(
      { joined: false, tenantId: 'default', tenantName: null, role: 'org_admin' },
      null
    );
    expect(merged.tenantId).toBe('default');
    expect(merged.role).toBe('org_admin');
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
