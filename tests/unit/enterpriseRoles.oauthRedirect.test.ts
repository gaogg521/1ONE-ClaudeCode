/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveOAuthPostLoginRedirectPath } from '@/common/auth/enterpriseRoles';

describe('resolveOAuthPostLoginRedirectPath', () => {
  it('redirects away from settings after OAuth', () => {
    expect(resolveOAuthPostLoginRedirectPath('/settings/model', 'member', 'default')).toBe('/guid');
  });

  it('keeps enterprise workspace for joined tenants', () => {
    expect(resolveOAuthPostLoginRedirectPath('/settings/model', 'member', 'tenant_acme')).toBe('/guid');
    expect(resolveOAuthPostLoginRedirectPath('/issues', 'member', 'tenant_acme')).toBe('/issues');
  });

  it('sends admin OAuth legacy /enterprise/auth redirect to console home', () => {
    expect(resolveOAuthPostLoginRedirectPath('/enterprise/auth', 'org_admin', 'tenant_acme')).toBe('/enterprise');
  });

  it('sends member OAuth legacy /enterprise/auth redirect to console home fallback', () => {
    expect(resolveOAuthPostLoginRedirectPath('/enterprise/auth', 'member', 'tenant_acme')).toBe('/enterprise');
  });

  it('does not loop SSO sign-in back to the join page when no enterprise exists', () => {
    // No enterprise tenant yet: an authenticated SSO user must land in the personal
    // workspace, not be bounced back to /enterprise/join (which re-triggers login → loop).
    expect(resolveOAuthPostLoginRedirectPath('/enterprise/join', 'member', 'default')).toBe('/guid');
    expect(resolveOAuthPostLoginRedirectPath('/enterprise/users', 'member', 'default')).toBe('/guid');
  });
});
