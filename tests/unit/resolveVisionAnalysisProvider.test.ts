/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import {
  pickGatewayVisionModel,
  resolveVisionAnalysisProvider,
} from '@process/services/imageAnalysisPrefetch';

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
  },
}));

import { ProcessConfig } from '@process/utils/initStorage';

const gateway: IProvider = {
  id: 'gw1',
  name: 'LiteLLM',
  platform: 'custom',
  baseUrl: 'https://gateway.example.com',
  apiKey: 'secret',
  model: ['kimi-k2-6', 'qwen-3-6-plus', 'claude-sonnet-4-6', 'minimax-2-7'],
};

describe('resolveVisionAnalysisProvider', () => {
  beforeEach(() => {
    vi.mocked(ProcessConfig.get).mockReset();
  });

  it('prefers settings image model over chat model', async () => {
    vi.mocked(ProcessConfig.get).mockImplementation(async (key: string) => {
      if (key === 'tools.imageGenerationModel') {
        return { useModel: 'qwen-3-6-plus', apiKey: 'img-key', baseUrl: 'https://img.example.com' };
      }
      if (key === 'model.config') return [gateway];
      return undefined;
    });

    const chat: TProviderWithModel = { ...gateway, useModel: 'kimi-k2-6' };
    const provider = await resolveVisionAnalysisProvider(chat);
    expect(provider?.useModel).toBe('qwen-3-6-plus');
    expect(provider?.apiKey).toBe('img-key');
  });

  it('uses alternate gateway vision model when chat model is not ideal for analysis', async () => {
    vi.mocked(ProcessConfig.get).mockImplementation(async (key: string) => {
      if (key === 'tools.imageGenerationModel') return undefined;
      if (key === 'model.config') return [gateway];
      return undefined;
    });

    const chat: TProviderWithModel = { ...gateway, useModel: 'kimi-k2-6' };
    const provider = await resolveVisionAnalysisProvider(chat);
    expect(provider?.useModel).not.toBe('kimi-k2-6');
    expect(provider?.useModel).toBeTruthy();
  });

  it('uses conversationModel.model list when ProcessConfig has no gateway entry', async () => {
    vi.mocked(ProcessConfig.get).mockImplementation(async () => []);

    const chat: TProviderWithModel = {
      id: 'gw1',
      name: 'LiteLLM',
      platform: 'custom',
      baseUrl: 'https://gateway.example.com',
      apiKey: 'secret',
      useModel: 'qwen-3-7-max',
      model: ['qwen-3-7-max', 'qwen-3-6-plus', 'claude-sonnet-4-6'],
    };
    const providers = await import('@process/services/imageAnalysisPrefetch').then((m) =>
      m.listVisionAnalysisProviders(chat)
    );
    expect(providers.some((p) => p.useModel === 'claude-sonnet-4-6')).toBe(true);
    expect(providers.every((p) => p.useModel !== 'qwen-3-7-max')).toBe(true);
  });
});

describe('pickGatewayVisionModel', () => {
  it('prefers a vision model different from the chat model', () => {
    const pick = pickGatewayVisionModel(gateway, 'kimi-k2-6');
    expect(pick?.useModel).not.toBe('kimi-k2-6');
    expect(pick?.useModel).toBeTruthy();
  });
});
