/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configGet } = vi.hoisted(() => ({
  configGet: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: configGet },
}));

import { modelLooksMultimodal, resolveFallbackVisionModel } from '@process/services/visionModelResolver';
import type { IProvider } from '@/common/config/storage';

describe('modelLooksMultimodal', () => {
  it('matches known multimodal model ids', () => {
    for (const id of [
      'qwen-vl-max',
      'qwen2.5-vl-72b',
      'kimi-k2.6',
      'kimi-latest',
      'gpt-4o',
      'gpt-4o-mini',
      'gemini-3.1-pro-preview',
      'claude-3-5-sonnet',
      'glm-4v',
      'doubao-1.5-vision-pro',
      'pixtral-12b',
    ]) {
      expect(modelLooksMultimodal(id), id).toBe(true);
    }
  });

  it('does not match text-only model ids', () => {
    for (const id of ['deepseek-chat', 'qwen-max', 'gpt-3.5-turbo', 'glm-4-air', 'moonshot-v1-8k', '']) {
      expect(modelLooksMultimodal(id), id).toBe(false);
    }
  });

  it('handles undefined safely', () => {
    expect(modelLooksMultimodal(undefined)).toBe(false);
  });
});

function provider(over: Partial<IProvider>): IProvider {
  return {
    id: over.id ?? 'p',
    platform: 'custom',
    name: over.name ?? 'P',
    baseUrl: 'https://gw.example/v1',
    apiKey: over.apiKey ?? 'sk-x',
    model: over.model ?? ['m1'],
    ...over,
  } as IProvider;
}

describe('resolveFallbackVisionModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns undefined when no providers are configured', async () => {
    configGet.mockResolvedValueOnce([]);
    expect(await resolveFallbackVisionModel()).toBeUndefined();
  });

  it('prefers a provider explicitly tagged with the vision capability', async () => {
    configGet.mockResolvedValueOnce([
      provider({ id: 'text', model: ['deepseek-chat'] }),
      provider({ id: 'vis', model: ['some-model'], capabilities: [{ type: 'vision' }] }),
    ]);
    const res = await resolveFallbackVisionModel();
    expect(res?.id).toBe('vis');
    expect(res?.useModel).toBe('some-model');
  });

  it('falls back to a multimodal-looking model id when no capability tag exists', async () => {
    configGet.mockResolvedValueOnce([
      provider({ id: 'text', model: ['deepseek-chat'] }),
      provider({ id: 'guess', model: ['plain', 'qwen-vl-max'] }),
    ]);
    const res = await resolveFallbackVisionModel();
    expect(res?.id).toBe('guess');
    expect(res?.useModel).toBe('qwen-vl-max');
  });

  it('skips disabled providers and ones without an api key', async () => {
    configGet.mockResolvedValueOnce([
      provider({ id: 'disabled', enabled: false, model: ['gpt-4o'] }),
      provider({ id: 'nokey', apiKey: '', model: ['gpt-4o'] }),
    ]);
    expect(await resolveFallbackVisionModel()).toBeUndefined();
  });

  it('excludes the active chat model so it is not re-picked', async () => {
    configGet.mockResolvedValueOnce([provider({ id: 'vis', model: ['gpt-4o'], capabilities: [{ type: 'vision' }] })]);
    const res = await resolveFallbackVisionModel({ id: 'vis', useModel: 'gpt-4o' } as never);
    expect(res).toBeUndefined();
  });
});
