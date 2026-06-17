/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockSyncMcpToAgents = vi.fn();

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
  },
}));

vi.mock('@process/services/mcpServices/McpService', () => ({
  mcpService: {
    syncMcpToAgents: (...args: unknown[]) => mockSyncMcpToAgents(...args),
  },
}));

import { buildConversationModelEnv, syncImageGenConversationModelEnv } from '@process/utils/imageGenMcpEnv';

describe('imageGenMcpEnv', () => {
  const model: TProviderWithModel = {
    id: 'p1',
    name: 'Qwen',
    platform: 'custom',
    baseUrl: 'https://gateway/v1',
    apiKey: 'sk-test',
    useModel: 'qwen-3-6-plus',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncMcpToAgents.mockResolvedValue({ success: true, results: [] });
  });

  it('buildConversationModelEnv maps chat model to ONE_CONV_* keys', () => {
    expect(buildConversationModelEnv(model)).toEqual({
      ONE_CONV_PLATFORM: 'custom',
      ONE_CONV_MODEL: 'qwen-3-6-plus',
      ONE_CONV_BASE_URL: 'https://gateway/v1',
      ONE_CONV_API_KEY: 'sk-test',
    });
  });

  it('syncImageGenConversationModelEnv writes ONE_CONV into builtin image-gen MCP env', async () => {
    const server: IMcpServer = {
      id: 'builtin-image-gen',
      name: 'one-image-generation',
      builtin: true,
      enabled: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['out/main/builtin-mcp-image-gen.js'],
        env: { ONE_IMG_MODEL: 'dall-e-3' },
      },
      tools: [],
      status: 'disconnected',
      createdAt: 1,
      updatedAt: 1,
      description: '',
      originalJson: '{}',
    };
    mockGet.mockResolvedValue([server]);

    await syncImageGenConversationModelEnv(model);

    expect(mockSet).toHaveBeenCalledWith(
      'mcp.config',
      expect.arrayContaining([
        expect.objectContaining({
          transport: expect.objectContaining({
            env: expect.objectContaining({
              ONE_IMG_MODEL: 'dall-e-3',
              ONE_CONV_MODEL: 'qwen-3-6-plus',
              ONE_CONV_PLATFORM: 'custom',
            }),
          }),
        }),
      ])
    );
    expect(mockSyncMcpToAgents).toHaveBeenCalled();
  });

  it('skips ProcessConfig write when ONE_CONV env is unchanged', async () => {
    const env = buildConversationModelEnv(model);
    const server: IMcpServer = {
      id: 'builtin-image-gen',
      name: 'one-image-generation',
      builtin: true,
      enabled: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['out/main/builtin-mcp-image-gen.js'],
        env: { ONE_IMG_MODEL: 'dall-e-3', ...env },
      },
      tools: [],
      status: 'disconnected',
      createdAt: 1,
      updatedAt: 1,
      description: '',
      originalJson: '{}',
    };
    mockGet.mockResolvedValue([server]);

    await syncImageGenConversationModelEnv(model);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockSyncMcpToAgents).not.toHaveBeenCalled();
  });
});
