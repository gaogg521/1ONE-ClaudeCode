/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildGreetingReplyBlock, buildLanguageMatchBlock } from '@/common/chat/languagePolicy';

describe('buildLanguageMatchBlock', () => {
  it('skips casual greetings to avoid echo replies', () => {
    expect(buildLanguageMatchBlock('你好')).toBe('');
    expect(buildLanguageMatchBlock('Hello!')).toBe('');
  });

  it('includes language policy for substantive messages', () => {
    const block = buildLanguageMatchBlock('请帮我分析这张图片');
    expect(block).toContain('<system-reminder>');
    expect(block).toContain('do not echo');
  });
});

describe('buildGreetingReplyBlock', () => {
  it('guides natural single greeting replies via system-reminder', () => {
    const block = buildGreetingReplyBlock('你好');
    expect(block).toContain('<system-reminder>');
    expect(block).toContain('Do NOT say 你好你好');
  });
});
