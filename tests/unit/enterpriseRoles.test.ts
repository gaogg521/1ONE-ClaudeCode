/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  resolveEnterpriseEditionPath,
  resolvePostLoginRedirectPath,
} from '@/common/auth/enterpriseRoles';

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

  it('allows org admins into admin console', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/users', 'org_admin', 'tenant-a')).toBe(
      '/enterprise/users'
    );
  });

  it('allows not-joined admins targeting admin home to enter console', () => {
    expect(resolvePostLoginRedirectPath('/enterprise', 'org_admin', 'default')).toBe('/enterprise');
  });

  it('keeps not-joined non-admins on join page when targeting admin home', () => {
    expect(resolvePostLoginRedirectPath('/enterprise', 'member', 'default')).toBe('/enterprise/join');
  });

  it('blocks joined members from admin-only enterprise routes', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/users', 'member', 'tenant-a')).toBe('/enterprise');
  });

  it('allows joined members into member-visible enterprise routes', () => {
    expect(resolvePostLoginRedirectPath('/enterprise/rag', 'member', 'tenant-a')).toBe('/enterprise/rag');
  });
});
