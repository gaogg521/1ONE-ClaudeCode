/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import { BUILTIN_IMAGE_GEN_ID } from '@process/resources/builtinMcp/constants';
import { mcpService } from '@process/services/mcpServices/McpService';
import { ProcessConfig } from '@process/utils/initStorage';

export function buildConversationModelEnv(model: TProviderWithModel): Record<string, string> {
  const env: Record<string, string> = {
    ONE_CONV_PLATFORM: model.platform,
    ONE_CONV_MODEL: model.useModel,
  };
  if (model.baseUrl) {
    env.ONE_CONV_BASE_URL = model.baseUrl;
  }
  if (model.apiKey) {
    env.ONE_CONV_API_KEY = model.apiKey;
  }
  return env;
}

/** Inject active chat model credentials into built-in image-gen MCP env for vision analysis fallback. */
export async function syncImageGenConversationModelEnv(model: TProviderWithModel): Promise<void> {
  const mcpServers: IMcpServer[] = (await ProcessConfig.get('mcp.config').catch((): IMcpServer[] => [])) || [];
  const idx = mcpServers.findIndex((s) => s.builtin === true && s.id === BUILTIN_IMAGE_GEN_ID);
  if (idx < 0) {
    return;
  }

  const server = mcpServers[idx];
  const transport = server.transport;
  if (transport.type !== 'stdio') {
    return;
  }

  const convEnv = buildConversationModelEnv(model);
  const currentEnv = transport.env ?? {};
  const nextEnv = { ...currentEnv, ...convEnv };
  const unchanged = Object.entries(convEnv).every(([key, value]) => currentEnv[key] === value);
  if (unchanged) {
    return;
  }

  mcpServers[idx] = {
    ...server,
    transport: {
      ...transport,
      env: nextEnv,
    },
  };
  await ProcessConfig.set('mcp.config', mcpServers);

  await mcpService.syncMcpToAgents([mcpServers[idx]], [{ backend: 'aionrs', name: 'aionrs' }]).catch((error) => {
    console.warn('[imageGenMcpEnv] Failed to sync image-gen MCP env to aionrs:', error);
  });
}
