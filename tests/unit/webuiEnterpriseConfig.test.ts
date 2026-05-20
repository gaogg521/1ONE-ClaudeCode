/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isEnterpriseTenantId,
  normalizeWebuiManagementMode,
} from '@/common/config/webuiEnterpriseConfig';

describe('webuiEnterpriseConfig', () => {
  it('treats default tenant as not joined', () => {
    expect(isEnterpriseTenantId('default')).toBe(false);
    expect(isEnterpriseTenantId(undefined)).toBe(false);
  });

  it('treats non-default tenant as joined', () => {
    expect(isEnterpriseTenantId('acme-corp')).toBe(true);
  });

  it('normalizes management mode', () => {
    expect(normalizeWebuiManagementMode('enterprise')).toBe('enterprise');
    expect(normalizeWebuiManagementMode('standalone')).toBe('standalone');
    expect(normalizeWebuiManagementMode('other')).toBe('standalone');
  });
});
