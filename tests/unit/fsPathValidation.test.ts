/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isPlausibleReadFilePath } from '../../src/common/chat/fsPathValidation';

describe('isPlausibleReadFilePath', () => {
  it('accepts normal absolute paths', () => {
    expect(isPlausibleReadFilePath('D:\\project\\package.json')).toBe(true);
    expect(isPlausibleReadFilePath('/home/user/readme.md')).toBe(true);
  });

  it('rejects Chinese sentence fragments', () => {
    expect(isPlausibleReadFilePath('从截图中可以看到终端报错，涉及 package.json')).toBe(false);
  });

  it('rejects paths with Chinese punctuation', () => {
    expect(isPlausibleReadFilePath('foo，bar.json')).toBe(false);
  });
});
