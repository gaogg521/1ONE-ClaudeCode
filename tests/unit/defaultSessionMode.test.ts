/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getDefaultSessionMode, isYoloSessionMode, resolveSessionMode } from '@/common/config/defaultSessionMode';

describe('defaultSessionMode', () => {
  it('defaults new aionrs sessions to yolo', () => {
    expect(getDefaultSessionMode('aionrs')).toBe('yolo');
    expect(resolveSessionMode('aionrs', undefined)).toBe('yolo');
  });

  it('respects persisted session mode when user explicitly chose default', () => {
    expect(resolveSessionMode('aionrs', 'default', { userSet: true })).toBe('default');
  });

  it('upgrades legacy default to backend yolo default', () => {
    expect(resolveSessionMode('aionrs', 'default')).toBe('yolo');
    expect(resolveSessionMode('gemini', 'default')).toBe('yolo');
  });

  it('detects yolo-like modes', () => {
    expect(isYoloSessionMode('yolo')).toBe(true);
    expect(isYoloSessionMode('bypassPermissions')).toBe(true);
    expect(isYoloSessionMode('default')).toBe(false);
  });
});
