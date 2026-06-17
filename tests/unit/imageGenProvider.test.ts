/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resolveImageGenProvider } from '../../src/common/chat/imageGenProvider';

describe('resolveImageGenProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers conversation vision model when analyzing images', () => {
    process.env.ONE_IMG_PLATFORM = 'custom';
    process.env.ONE_IMG_MODEL = 'dall-e-3';
    process.env.ONE_CONV_PLATFORM = 'custom';
    process.env.ONE_CONV_MODEL = 'qwen-3-6-plus';
    process.env.ONE_CONV_BASE_URL = 'https://example.com/v1';
    process.env.ONE_CONV_API_KEY = 'key';

    const provider = resolveImageGenProvider(true);
    expect(provider?.useModel).toBe('qwen-3-6-plus');
  });

  it('uses ONE_IMG for generation when no images to analyze', () => {
    process.env.ONE_IMG_PLATFORM = 'custom';
    process.env.ONE_IMG_MODEL = 'dall-e-3';
    process.env.ONE_CONV_PLATFORM = 'custom';
    process.env.ONE_CONV_MODEL = 'qwen-3-6-plus';

    const provider = resolveImageGenProvider(false);
    expect(provider?.useModel).toBe('dall-e-3');
  });

  it('falls back to conversation model when ONE_IMG is missing', () => {
    delete process.env.ONE_IMG_PLATFORM;
    delete process.env.ONE_IMG_MODEL;
    process.env.ONE_CONV_PLATFORM = 'custom';
    process.env.ONE_CONV_MODEL = 'qwen-3-6-plus';

    const provider = resolveImageGenProvider(true);
    expect(provider?.useModel).toBe('qwen-3-6-plus');
  });
});
