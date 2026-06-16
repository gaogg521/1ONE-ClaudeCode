/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@process/services/attachmentTextExtractor', () => ({
  buildAttachmentContextBlock: vi.fn(async () => '<1one-attachment-context>\nPDF text\n</1one-attachment-context>\n\n'),
}));

vi.mock('@process/services/imageAnalysisPrefetch', () => ({
  buildPrefetchedImageAnalysisBlock: vi.fn(async () => ''),
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

import { buildAttachmentContextBlock } from '@process/services/attachmentTextExtractor';

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
    const prompt = composeAgentPrompt(
      'User question',
      '<1one-attachment-context>\nBody\n</1one-attachment-context>\n\n'
    );
    expect(prompt.startsWith('<1one-attachment-context>')).toBe(true);
    expect(prompt.endsWith('User question')).toBe(true);
  });

  it('injects system-reminder for 你好 to prevent 你好你好', async () => {
    const prefix = await buildPromptAugmentationPrefix({
      displayContent: '你好',
      files: [],
      agentType: 'aionrs',
      modelId: 'qwen-3-6-plus',
    });
    expect(prefix).toContain('<system-reminder>');
    expect(prefix).toContain('Do NOT say 你好你好');
    expect(prefix).not.toContain('1one-language-policy');
  });

  it('aionrs image attachments always use prefetched analysis path (no tool fallback)', async () => {
    const prefix = await buildPromptAugmentationPrefix({
      displayContent: '这是什么错误',
      files: ['C:/tmp/shot.png', 'C:/tmp/package.json'],
      agentType: 'aionrs',
      modelId: 'qwen-3-6-plus',
      workspaceDir: 'C:/workspace',
      conversationModel: {
        id: 'p1',
        name: 'LiteLLM',
        platform: 'custom',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        useModel: 'qwen-3-6-plus',
      },
    });
    expect(prefix).not.toContain('one_image_generation');
    expect(prefix).not.toContain('PDF text');
    expect(prefix).toContain('Prioritize analyzing the IMAGE');
  });

  it('aionrs uses prefetched image analysis when available', async () => {
    const { buildPrefetchedImageAnalysisBlock } = await import('@process/services/imageAnalysisPrefetch');
    vi.mocked(buildPrefetchedImageAnalysisBlock).mockResolvedValueOnce(
      '<1one-image-analysis>\nTerminal shows deploy logs\n</1one-image-analysis>\n\n'
    );

    const prefix = await buildPromptAugmentationPrefix({
      displayContent: '这个是什么意思',
      files: ['C:/tmp/shot.png'],
      agentType: 'aionrs',
      modelId: 'qwen-3-6-plus',
      workspaceDir: 'C:/workspace',
      conversationModel: {
        id: 'p1',
        name: 'LiteLLM',
        platform: 'custom',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        useModel: 'qwen-3-6-plus',
      },
    });

    expect(prefix).toContain('<1one-image-analysis>');
    expect(prefix).toContain('Terminal shows deploy logs');
    expect(prefix).not.toContain('one_image_generation');
  });

  it('extracts non-image files when user mentions them alongside images', async () => {
    const prefix = await buildPromptAugmentationPrefix({
      displayContent: '对比截图和 package.json 的差异',
      files: ['C:/tmp/shot.png', 'C:/tmp/package.json'],
      agentType: 'aionrs',
      modelId: 'qwen-3-6-plus',
      workspaceDir: 'C:/workspace',
      conversationModel: {
        id: 'p1',
        name: 'LiteLLM',
        platform: 'custom',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        useModel: 'qwen-3-6-plus',
      },
    });
    expect(prefix).not.toContain('one_image_generation');
    expect(prefix).toContain('PDF text');
  });
});
