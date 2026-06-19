/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveOAuthPostLoginRedirectPath } from '@/common/auth/enterpriseRoles';

describe('resolveOAuthPostLoginRedirectPath', () => {
  it('redirects away from settings after OAuth', () => {
    expect(resolveOAuthPostLoginRedirectPath('/settings/model', 'member', 'default')).toBe('/sessions');
  });

  it('keeps enterprise workspace for joined tenants', () => {
    expect(resolveOAuthPostLoginRedirectPath('/settings/model', 'member', 'tenant_acme')).toBe('/sessions');
    expect(resolveOAuthPostLoginRedirectPath('/issues', 'member', 'tenant_acme')).toBe('/issues');
  });

  it('sends admin OAuth legacy /enterprise/auth redirect to console home', () => {
    expect(resolveOAuthPostLoginRedirectPath('/enterprise/auth', 'org_admin', 'tenant_acme')).toBe('/enterprise');
  });
});
