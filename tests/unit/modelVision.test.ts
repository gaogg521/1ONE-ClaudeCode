/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { modelSupportsNativeVision } from '@/common/chat/modelVision';

describe('modelSupportsNativeVision', () => {
  it('detects Qwen3.6 Plus variants', () => {
    expect(modelSupportsNativeVision('qwen-3-6-plus')).toBe(true);
    expect(modelSupportsNativeVision('qwen3.6-plus')).toBe(true);
    expect(modelSupportsNativeVision('qwen3.5-plus')).toBe(true);
  });

  it('detects other common vision models', () => {
    expect(modelSupportsNativeVision('gpt-4o')).toBe(true);
    expect(modelSupportsNativeVision('claude-sonnet-4-6')).toBe(true);
  });

  it('rejects embedding-only models', () => {
    expect(modelSupportsNativeVision('text-embedding-3-small')).toBe(false);
  });
});
