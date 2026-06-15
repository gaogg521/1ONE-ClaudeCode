/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@process/services/attachmentTextExtractor', () => ({
  buildAttachmentContextBlock: vi.fn(async () => '<1one-attachment-context>\nPDF text\n</1one-attachment-context>\n\n'),
}));

vi.mock('@/common/web/prefetchWebContext', () => ({
  shouldPrefetchWebContext: vi.fn((text: string) => text.includes('https://')),
  prefetchWebContextForUserMessage: vi.fn(async () => ({
    kind: 'fetch',
    url: 'https://example.com',
    text: 'Example',
    block: '<1one-web-context>\nExample page\n</1one-web-context>\n\n',
  })),
}));

import { buildPromptAugmentationPrefix, composeAgentPrompt } from '@process/services/promptAugmentation';

describe('promptAugmentation', () => {
  it('combines attachment and web blocks', async () => {
    const prefix = await buildPromptAugmentationPrefix({
      displayContent: 'Summarize this https://example.com',
      files: ['C:/tmp/report.pdf'],
    });

    expect(prefix).toContain('<1one-attachment-context>');
    expect(prefix).toContain('<1one-web-context>');
  });

  it('composes agent prompt without changing display content', () => {
    const prompt = composeAgentPrompt('User question', '<1one-attachment-context>\nBody\n</1one-attachment-context>\n\n');
    expect(prompt.startsWith('<1one-attachment-context>')).toBe(true);
    expect(prompt.endsWith('User question')).toBe(true);
  });
});
