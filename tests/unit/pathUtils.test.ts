/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { extname, isPathInsideDir, joinPath, resolvePath } from '@/common/chat/pathUtils';

describe('pathUtils', () => {
  it('extracts extensions case-insensitively', () => {
    expect(extname('photo.JPG')).toBe('.jpg');
    expect(extname('notes')).toBe('');
  });

  it('joins workspace-relative paths', () => {
    expect(joinPath('C:/workspace/', 'file.txt')).toBe('C:/workspace/file.txt');
  });

  it('detects cache temp directories on Windows', () => {
    const tempDir = resolvePath('C:/app/config', 'temp');
    expect(isPathInsideDir('C:/app/config/temp/pasted.png', tempDir)).toBe(true);
    expect(isPathInsideDir('C:/app/workspace/pasted.png', tempDir)).toBe(false);
  });
});
