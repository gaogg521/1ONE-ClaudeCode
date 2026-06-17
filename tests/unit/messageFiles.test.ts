/**
 * @license
 * Copyright 2025 1ONE ClaudeCode (1one-claudecode.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildDisplayMessage,
  filterValidAttachmentPaths,
  isCacheTempFilePath,
  isImageFilePath,
  parseDisplayMessageFiles,
  stripFilesMarker,
} from '@/common/chat/messageFiles';
import { ONE_FILES_MARKER } from '@/common/config/constants';

describe('buildDisplayMessage', () => {
  const workspace = '/tmp/aion/workspace-1';

  it('preserves absolute workspace paths for preview loading', () => {
    const files = [`${workspace}/uploads/photo.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/uploads/photo.jpg`);
  });

  it('keeps ONE timestamp suffixes so FilePreview can resolve the real file', () => {
    const files = [`${workspace}/uploads/photo_ONE_1234567890123.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/uploads/photo_ONE_1234567890123.jpg`);
    expect(result).not.toContain(`${workspace}/uploads/photo.jpg`);
  });

  it('keeps external absolute paths when workspace is missing', () => {
    const files = ['C:/cache/temp/pasted_image.png'];
    const result = buildDisplayMessage('hello', files, '');
    expect(result).toContain('C:/cache/temp/pasted_image.png');
  });

  it('joins relative paths under workspace', () => {
    const files = ['relative/file.txt'];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/relative/file.txt`);
  });

  it('returns input unchanged when no files', () => {
    const result = buildDisplayMessage('hello', [], workspace);
    expect(result).toBe('hello');
  });
});

describe('path helpers', () => {
  it('detects cache temp uploads', () => {
    expect(isCacheTempFilePath('C:/app/config/temp/pasted.png', 'C:/app/config')).toBe(true);
    expect(isCacheTempFilePath('C:/app/workspace/pasted.png', 'C:/app/config')).toBe(false);
  });

  it('detects image file extensions', () => {
    expect(isImageFilePath('photo.JPG')).toBe(true);
    expect(isImageFilePath('notes.pdf')).toBe(false);
  });
});

describe('stripFilesMarker', () => {
  it('removes embedded file paths from the message body', () => {
    const body = `hello\n\n${ONE_FILES_MARKER}\n/tmp/a.png`;
    expect(stripFilesMarker(body)).toBe('hello');
  });
});

describe('parseDisplayMessageFiles', () => {
  it('keeps real attachment paths and drops extracted document text lines', () => {
    const body = [
      'hello',
      '',
      ONE_FILES_MARKER,
      'C:/workspace/invoice.pdf',
      '- **公司**: GoDaddy LLC',
      '## 📝 总结',
      '你通过支付宝支付了 21 元',
    ].join('\n');
    expect(parseDisplayMessageFiles(body)).toEqual(['C:/workspace/invoice.pdf']);
  });

  it('salvages a path when PDF text was concatenated without a newline', () => {
    const body = `hello\n\n${ONE_FILES_MARKER}\nC:/workspace/invoice.pdf这是一份来自 GoDaddy 的账单`;
    expect(parseDisplayMessageFiles(body)).toEqual(['C:/workspace/invoice.pdf']);
  });
});

describe('filterValidAttachmentPaths', () => {
  it('accepts image paths', () => {
    expect(filterValidAttachmentPaths(['D:/photos/test.png'])).toEqual(['D:/photos/test.png']);
  });
});
