/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { userReferencesAttachmentPath } from '@/common/chat/attachmentContext';

describe('userReferencesAttachmentPath', () => {
  it('detects filename mentions', () => {
    expect(userReferencesAttachmentPath('请分析 package.json', '/tmp/package.json')).toBe(true);
    expect(userReferencesAttachmentPath('这是什么错误', '/tmp/package.json')).toBe(false);
  });
});
