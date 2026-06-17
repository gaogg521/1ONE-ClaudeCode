/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isOneMillionContextModel, resolveAcpContextLimit } from '@/common/utils/resolveAcpContextLimit';

describe('resolveAcpContextLimit', () => {
  it('prefers 1M model limit when bridge reports 200K', () => {
    expect(resolveAcpContextLimit(200_000, 'sonnet[1m]')).toBe(1_000_000);
    expect(resolveAcpContextLimit(200_000, 'claude-sonnet-4-6')).toBe(1_000_000);
  });

  it('uses model limit when reported size is below model capacity', () => {
    expect(resolveAcpContextLimit(900_000, 'claude-sonnet-4-6')).toBe(1_000_000);
  });

  it('uses model limit when reported size is zero', () => {
    expect(resolveAcpContextLimit(0, 'sonnet[1m]')).toBe(1_000_000);
  });

  it('returns zero when both inputs are empty', () => {
    expect(resolveAcpContextLimit(0, null)).toBe(0);
  });
});

describe('isOneMillionContextModel', () => {
  it('detects 1M aliases', () => {
    expect(isOneMillionContextModel('sonnet[1m]')).toBe(true);
    expect(isOneMillionContextModel('claude-sonnet-4-6-1m')).toBe(true);
    expect(isOneMillionContextModel('claude-sonnet-4-5')).toBe(false);
  });
});
