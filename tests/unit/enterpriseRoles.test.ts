/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isWebuiBuiltinAdministrator,
  resolveEnterpriseEditionPath,
  resolveEnterpriseTenantDisplayLabel,
  resolvePostLoginRedirectPath,
} from '@/common/auth/enterpriseRoles';

describe('isWebuiBuiltinAdministrator', () => {
  it('allows only explicit admin roles', () => {
    expect(isWebuiBuiltinAdministrator({ role: 'system_admin' })).toBe(true);
    expect(isWebuiBuiltinAdministrator({ role: 'org_admin' })).toBe(true);
    expect(isWebuiBuiltinAdministrator({ role: 'member' })).toBe(false);
  });

  it('does not treat desktop placeholder identity or admin username as super-admin', () => {
    expect(
      isWebuiBuiltinAdministrator({
        id: 'desktop-local-admin',
        username: 'admin',
        role: 'member',
        tenant_id: 'default',
      })
    ).toBe(false);
    expect(
      isWebuiBuiltinAdministrator({
        id: 'user_123',
        username: 'admin',
        role: 'member',
        tenant_id: 'default',
      })
    ).toBe(false);
  });
});

describe('resolveEnterpriseTenantDisplayLabel', () => {
  it('shows standalone label instead of raw default tenant id', () => {
    expect(resolveEnterpriseTenantDisplayLabel('default', null)).toBe('单机实例');
    expect(resolveEnterpriseTenantDisplayLabel('tenant-a', 'Acme')).toBe('Acme');
  });
});

describe('resolveEnterpriseEditionPath', () => {
  it('routes joined users to workspace', () => {
    expect(resolveEnterpriseEditionPath(true)).toBe('/sessions');
  });

  it('routes not-joined users to join page', () => {
    expect(resolveEnterpriseEditionPath(false)).toBe('/enterprise/join');
  });
});

describe('resolvePostLoginRedirectPath', () => {
  it('allows joined members into enterprise home', () => {
    expect(resolvePostLoginRedirectPath('/enterprise', 'member', 'tenant-a')).toBe('/enterprise');
  });

  it('sends joined users away from join path to workspace', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/join', 'member', 'tenant-a')).toBe('/sessions');
  });

  it('keeps not-joined users on join path', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/join', 'member', 'default')).toBe('/enterprise/join');
  });

  it('blocks non-admins from admin console', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/teams', 'member', 'tenant-a')).toBe('/enterprise');
  });

  it('allows org admins into auth configuration after login', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/auth', 'org_admin', 'tenant-a')).toBe(
      '/enterprise/auth'
    );
  });

  it('allows system admins into auth routes', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/auth', 'system_admin', 'tenant-a')).toBe(
      '/enterprise/auth'
    );
  });

  it('allows org admins into user management', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/users', 'org_admin', 'tenant-a')).toBe(
      '/enterprise/users'
    );
  });

  it('allows not-joined system admins targeting admin home to enter console', () => {
    expect(resolvePostLoginRedirectPath('/enterprise', 'system_admin', 'default')).toBe('/enterprise');
  });

  it('keeps not-joined org admins on join page when targeting admin home', () => {
    expect(resolvePostLoginRedirectPath('/enterprise', 'org_admin', 'default')).toBe('/enterprise/join');
  });

  it('blocks joined members from admin-only enterprise routes', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/users', 'member', 'tenant-a')).toBe('/enterprise');
  });

  it('allows joined members into member-visible enterprise routes', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/rag', 'member', 'tenant-a')).toBe('/enterprise/rag');
  });
});
