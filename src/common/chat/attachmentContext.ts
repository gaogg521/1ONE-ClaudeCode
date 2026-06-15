/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { extname } from '@/common/chat/pathUtils';
import { isImageFilePath } from '@/common/chat/messageFiles';

export const ATTACHMENT_CONTEXT_TAG = '1one-attachment-context';
export const WEB_CONTEXT_TAG = '1one-web-context';

/** Default max extracted characters per attachment file. */
export const DEFAULT_ATTACHMENT_MAX_CHARS = 50_000;

/** Default max total extracted characters across all attachments in one message. */
export const DEFAULT_ATTACHMENT_TOTAL_MAX_CHARS = 100_000;

const TEXT_EXTRACTABLE_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.xlsx',
  '.xls',
  '.html',
  '.htm',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.rtf',
]);

export type AttachmentExtractSection = {
  filePath: string;
  fileName: string;
  kind: string;
  text: string;
  truncated: boolean;
  error?: string;
};

export function getAttachmentFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || filePath;
}

export function isExtractableAttachmentPath(filePath: string): boolean {
  if (isImageFilePath(filePath)) {
    return false;
  }
  return TEXT_EXTRACTABLE_EXTENSIONS.has(extname(filePath));
}

export function messageAlreadyHasPromptAugmentation(content: string): boolean {
  return content.includes(`<${ATTACHMENT_CONTEXT_TAG}>`) || content.includes(`<${WEB_CONTEXT_TAG}>`);
}

export function formatAttachmentContextBlock(sections: AttachmentExtractSection[]): string {
  if (sections.length === 0) {
    return '';
  }

  const body = sections
    .map((section) => {
      if (section.error) {
        return `File: ${section.fileName}\nPath: ${section.filePath}\nError: ${section.error}`;
      }
      const truncatedNote = section.truncated ? '\n[Content truncated for context limits]' : '';
      return `File: ${section.fileName} (${section.kind})\nPath: ${section.filePath}${truncatedNote}\n---\n${section.text}\n---`;
    })
    .join('\n\n');

  return (
    `<${ATTACHMENT_CONTEXT_TAG}>\n` +
    `1ONE extracted text from user attachments before your reply. Use the content below; do not say you cannot read these files.\n\n` +
    `${body}\n` +
    `</${ATTACHMENT_CONTEXT_TAG}>\n\n`
  );
}
