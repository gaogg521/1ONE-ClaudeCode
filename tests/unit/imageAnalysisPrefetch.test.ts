/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common/chat/imageGenCore', () => ({
  executeImageGeneration: vi.fn(async () => ({
    success: false,
    text: 'tool_call_id not found',
    error: 'tool_call_id not found',
  })),
}));

import { buildPrefetchedImageAnalysisBlock } from '@process/services/imageAnalysisPrefetch';

describe('imageAnalysisPrefetch failures', () => {
  it('returns failed tag instead of empty string on API error', async () => {
    const block = await buildPrefetchedImageAnalysisBlock({
      imagePaths: ['C:/tmp/shot.png'],
      userQuestion: '这个是什么错误？',
      workspaceDir: 'C:/workspace',
      conversationModel: {
        id: 'p1',
        name: 'LiteLLM',
        platform: 'custom',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        useModel: 'kimi-k2-6',
      },
    });

    expect(block).toContain('<1one-image-analysis-failed>');
    expect(block).toContain('tool_call_id not found');
    expect(block).toContain('Do NOT call one_image_generation');
    expect(block).not.toContain('<1one-image-analysis>');
  });
});
