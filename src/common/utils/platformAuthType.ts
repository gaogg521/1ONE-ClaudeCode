/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProviderAuthType, ProviderAuthTypeChoice } from '@/common/types/providerAuthType';
import { isProviderLiteLlmProxy } from '@/common/utils/litellmGateway';
import { isNewApiPlatform } from './platformConstants';

/**
 * 根据平台名称获取对应的认证类型
 * @param platform 平台名称
 * @returns 对应的AuthType
 */
export function getAuthTypeFromPlatform(platform: string): ProviderAuthType {
  const platformLower = platform?.toLowerCase() || '';

  // Gemini 相关平台
  if (platformLower === 'openai-completions' || platformLower === 'openai/chat/completions') {
    return 'openai';
  }
  if (platformLower.includes('gemini-with-google-auth')) {
    return 'gemini';
  }
  if (platformLower.includes('gemini-vertex-ai') || platformLower.includes('vertex-ai')) {
    return 'vertex';
  }
  if (platformLower.includes('gemini') || platformLower.includes('google')) {
    return 'gemini';
  }

  // Anthropic/Claude 相关平台
  if (platformLower.includes('anthropic') || platformLower.includes('claude')) {
    return 'anthropic';
  }

  // AWS Bedrock 平台
  if (platformLower.includes('bedrock')) {
    return 'bedrock';
  }

  // New API 网关默认使用 OpenAI 兼容协议（per-model 协议由 getProviderAuthType 处理）
  // New API gateway defaults to OpenAI compatible (per-model protocol handled by getProviderAuthType)
  // 其他所有平台默认使用OpenAI兼容协议
  // 包括：OpenRouter, OpenAI, DeepSeek, new-api, 等
  return 'openai';
}

/**
 * 获取provider的认证类型，优先使用明确指定的authType，否则根据platform推断
 * 对于 new-api 平台，支持基于模型名称的协议覆盖
 * Get provider auth type, prefer explicit authType, otherwise infer from platform
 * For new-api platform, supports per-model protocol overrides
 * @param provider 包含platform和可选authType的provider配置
 * @returns 认证类型
 */
export function getProviderAuthType(provider: {
  platform: string;
  authType?: ProviderAuthTypeChoice;
  authTypeCustom?: string;
  modelProtocols?: Record<string, string>;
  useModel?: string;
  model?: string[];
  baseUrl?: string;
  name?: string;
  litellmProxy?: boolean;
}): ProviderAuthType {
  let resolved: ProviderAuthType;

  // 如果明确指定了authType，直接使用
  if (provider.authType) {
    if (provider.authType === 'openai-completions') {
      resolved = 'openai';
    } else if (provider.authType === 'custom') {
      resolved = getAuthTypeFromPlatform(provider.authTypeCustom || 'openai');
    } else {
      resolved = provider.authType;
    }
  } else if (isNewApiPlatform(provider.platform) && provider.useModel && provider.modelProtocols) {
    // new-api 平台：根据模型名称查找协议覆盖
    // new-api platform: look up per-model protocol override
    const protocol = provider.modelProtocols[provider.useModel];
    if (protocol) {
      resolved = getAuthTypeFromPlatform(protocol);
    } else {
      resolved = getAuthTypeFromPlatform(provider.platform);
    }
  } else {
    // 否则根据platform推断
    resolved = getAuthTypeFromPlatform(provider.platform);
  }

  // LiteLLM is always OpenAI-compatible HTTP; never use Anthropic/Gemini/Vertex native client paths.
  if (isProviderLiteLlmProxy(provider) && (resolved === 'gemini' || resolved === 'vertex' || resolved === 'anthropic')) {
    return 'openai';
  }
  return resolved;
}
