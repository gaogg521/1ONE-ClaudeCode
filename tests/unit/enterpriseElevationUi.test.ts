/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildFlatVerifyOptions, pickDefaultVerifyChoiceId } from '@/renderer/pages/enterprise/enterpriseElevationUi';
import type { EnterpriseElevationSecondaryOption } from '@/common/types/enterpriseElevation';

describe('enterpriseElevationUi', () => {
  it('shows LDAP as disabled entry when server needs binding', () => {
    const methods: EnterpriseElevationSecondaryOption[] = [
      { id: 'local_password', kind: 'password', available: true },
      { id: 'ldap', kind: 'password', available: false, unavailableReason: 'ldap_not_bound' },
      { id: 'feishu', kind: 'oauth', available: false },
      { id: 'dingtalk', kind: 'oauth', available: false },
      { id: 'wecom', kind: 'oauth', available: false },
    ];
    const flat = buildFlatVerifyOptions(methods);
    const locked = flat.find((o) => o.kind === 'password' && o.method === 'ldap');
    expect(locked?.kind).toBe('password');
    if (locked?.kind === 'password') {
      expect(locked.locked).toBe(true);
      expect(locked.lockedReason).toBe('ldap_not_bound');
    }
  });

  it('defaults to an unlocked password option when LDAP is locked', () => {
    const methods: EnterpriseElevationSecondaryOption[] = [
      { id: 'local_password', kind: 'password', available: true },
      { id: 'ldap', kind: 'password', available: false, unavailableReason: 'ldap_not_bound' },
      { id: 'feishu', kind: 'oauth', available: false },
      { id: 'dingtalk', kind: 'oauth', available: false },
      { id: 'wecom', kind: 'oauth', available: false },
    ];
    const flat = buildFlatVerifyOptions(methods);
    expect(pickDefaultVerifyChoiceId(flat, null)).toBe('pw-local');
  });
});
