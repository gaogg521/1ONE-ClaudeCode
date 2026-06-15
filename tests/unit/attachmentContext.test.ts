/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_CONTEXT_TAG,
  formatAttachmentContextBlock,
  getAttachmentFileName,
  isExtractableAttachmentPath,
} from '@/common/chat/attachmentContext';

describe('attachmentContext', () => {
  it('detects extractable document paths', () => {
    expect(isExtractableAttachmentPath('C:/tmp/report.pdf')).toBe(true);
    expect(isExtractableAttachmentPath('C:/tmp/photo.png')).toBe(false);
    expect(isExtractableAttachmentPath('C:/tmp/readme.md')).toBe(true);
  });

  it('formats attachment context block', () => {
    const block = formatAttachmentContextBlock([
      {
        filePath: 'C:/tmp/report.pdf',
        fileName: 'report.pdf',
        kind: 'pdf',
        text: 'Hello PDF',
        truncated: false,
      },
    ]);

    expect(block).toContain(`<${ATTACHMENT_CONTEXT_TAG}>`);
    expect(block).toContain('report.pdf');
    expect(block).toContain('Hello PDF');
  });

  it('extracts file names from paths', () => {
    expect(getAttachmentFileName('C:\\work\\docs\\plan.docx')).toBe('plan.docx');
  });
});
