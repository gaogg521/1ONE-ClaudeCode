/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { canAccessEnterpriseRouteRole, getEnterpriseRouteMetaByKey } from '@/common/auth/enterpriseRoutes';

describe('canAccessEnterpriseRouteRole', () => {
  it('restricts system_admin-only routes to system_admin', () => {
    const auth = getEnterpriseRouteMetaByKey('auth');
    expect(auth?.requiresRole).toBe('admin');
    expect(canAccessEnterpriseRouteRole('system_admin', 'system_admin')).toBe(true);
    expect(canAccessEnterpriseRouteRole('system_admin', 'org_admin')).toBe(false);
    expect(canAccessEnterpriseRouteRole('system_admin', 'member')).toBe(false);
  });

  it('allows org_admin on admin routes such as users', () => {
    const users = getEnterpriseRouteMetaByKey('users');
    expect(users?.requiresRole).toBe('admin');
    expect(canAccessEnterpriseRouteRole('admin', 'org_admin')).toBe(true);
    expect(canAccessEnterpriseRouteRole('admin', 'system_admin')).toBe(true);
    expect(canAccessEnterpriseRouteRole('admin', 'member')).toBe(false);
  });
});
