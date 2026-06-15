/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { extname } from '@/common/chat/pathUtils';
import { isImageFilePath } from '@/common/chat/messageFiles';
import { wrapSystemReminder } from '@/common/chat/systemReminder';

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

/** Hidden context for image attachments — routes analysis through one_image_generation. */
export function buildToolBasedImageContextBlock(imagePaths: string[]): string {
  if (imagePaths.length === 0) {
    return '';
  }
  const lines = imagePaths.map((filePath) => `- ${filePath}`).join('\n');
  return wrapSystemReminder(
    'The user attached image file(s). You MUST call the one_image_generation tool now:\n' +
      '- prompt: start with "Analyze image:" and describe what to analyze (match the user language in your final reply)\n' +
      '- image_uris: use the absolute paths below\n' +
      'Answer from the tool result. Never say you cannot view or analyze images.\n\n' +
      lines
  );
}

/** Hidden context when the active model has native multimodal vision (e.g. Qwen3.6-Plus). */
export function buildNativeVisionImageContextBlock(imagePaths: string[]): string {
  if (imagePaths.length === 0) {
    return '';
  }
  const lines = imagePaths.map((filePath) => `- ${filePath}`).join('\n');
  return wrapSystemReminder(
    'The user attached image file(s). Analyze the screenshot/image content and answer their question.\n' +
      'If you cannot see pixels in this turn, call one_image_generation with image_uris set to the paths below.\n' +
      'Reply in the same language as the user.\n\n' +
      `Image paths:\n${lines}`
  );
}

/** When images and other files are attached, tell the model to prioritize the image. */
export function buildImagePriorityReminderBlock(): string {
  return wrapSystemReminder(
    'The user attached screenshot(s)/image(s). Prioritize analyzing the IMAGE content for their question. ' +
      'Do not answer from other attached files unless the user explicitly asks about those files.'
  );
}

export function userReferencesAttachmentPath(userText: string, filePath: string): boolean {
  const fileName = getAttachmentFileName(filePath);
  if (userText.includes(fileName)) {
    return true;
  }
  const normalizedPath = filePath.replace(/\\/g, '/');
  return userText.includes(normalizedPath) || userText.includes(filePath);
}

/** @deprecated Use buildToolBasedImageContextBlock or buildNativeVisionImageContextBlock */
export function buildImageAttachmentContextBlock(imagePaths: string[]): string {
  return buildToolBasedImageContextBlock(imagePaths);
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
