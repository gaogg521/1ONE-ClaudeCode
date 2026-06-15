/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTACHMENT_ANALYSIS_PROMPT,
  messageReferencesRecentAttachments,
} from '@/common/chat/attachmentFollowUp';

describe('messageReferencesRecentAttachments', () => {
  it('detects Chinese follow-up prompts about attachments', () => {
    expect(messageReferencesRecentAttachments('解读一下这个PDF')).toBe(true);
    expect(messageReferencesRecentAttachments('这个图片是什么')).toBe(true);
  });

  it('returns false for unrelated small talk', () => {
    expect(messageReferencesRecentAttachments('你好')).toBe(false);
    expect(messageReferencesRecentAttachments('')).toBe(false);
  });
});

describe('DEFAULT_ATTACHMENT_ANALYSIS_PROMPT', () => {
  it('is non-empty', () => {
    expect(DEFAULT_ATTACHMENT_ANALYSIS_PROMPT.length).toBeGreaterThan(10);
  });
});
