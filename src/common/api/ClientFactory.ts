/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@office-ai/aioncli-core';
import type { TProviderWithModel } from '../config/storage';
import { OpenAIRotatingClient, type OpenAIClientConfig } from './OpenAIRotatingClient';
import { GeminiRotatingClient, type GeminiClientConfig } from './GeminiRotatingClient';
import { AnthropicRotatingClient, type AnthropicClientConfig } from './AnthropicRotatingClient';
import type { RotatingApiClientOptions } from './RotatingApiClient';
import { getProviderAuthType } from '../utils/platformAuthType';
import { isNewApiPlatform } from '../utils/platformConstants';
import type { ProviderAuthType } from '@/common/types/providerAuthType';

/** Exported for Gemini worker env (must match ClientFactory OpenAI-compat URL rules). */
export function normalizeOpenAiCompatBaseUrl(baseUrl: string, authTypeCustom?: string): string {
  if (!baseUrl) return baseUrl;
  const raw = baseUrl.replace(/\/+$/, '');
  const lower = raw.toLowerCase();
  const custom = (authTypeCustom || '').trim().toLowerCase();

  // Vendor/gateway special mode: DashScope/Qwen OpenAI-compatible "compatible-mode"
  // Typical user input: "compatible-mode" (without slashes).
  if (custom.includes('compatible-mode')) {
    // If user already provided the full path, keep it and just ensure /v1.
    if (lower.includes('/compatible-mode/')) {
      return raw.replace(/\/v1$/, '') + '/v1';
    }
    // Strip any trailing /v1 and append compatible-mode/v1
    return raw.replace(/\/v1$/, '') + '/compatible-mode/v1';
  }

  // Be conservative: many OpenAI-compatible vendors already include their own versioned path
  // (e.g. /api/v3, /api/paas/v4). Appending /v1 would break those endpoints (often 405).
  // Only append /v1 when the URL has no obvious version segment.
  const hasVersionPath =
    /\/v\d+(?:$|\/)/i.test(raw) || // /v1, /v2, /v3...
    /\/api\/v\d+(?:$|\/)/i.test(raw) || // /api/v3...
    /\/compatible-mode\/v1(?:$|\/)/i.test(raw);
  if (hasVersionPath) return raw;

  // Default OpenAI-compatible endpoints usually end with /v1 for the OpenAI SDK.
  return `${raw}/v1`;
}

export interface ClientOptions {
  timeout?: number;
  proxy?: string;
  baseConfig?: OpenAIClientConfig | GeminiClientConfig | AnthropicClientConfig;
  rotatingOptions?: RotatingApiClientOptions;
}

export type RotatingClient = OpenAIRotatingClient | GeminiRotatingClient | AnthropicRotatingClient;

/**
 * 为 new-api 网关规范化 base URL
 * Normalize base URL for new-api gateway based on target protocol
 *
 * 策略：先剥离所有已知 API 路径后缀得到根 URL，再根据目标协议添加正确后缀。
 * Strategy: strip all known API path suffixes to get root URL, then add the correct suffix for target protocol.
 *
 * @param baseUrl 原始 base URL / Original base URL
 * @param authType 目标认证类型 / Target auth type
 * @returns 规范化后的 base URL / Normalized base URL
 */
export function normalizeNewApiBaseUrl(baseUrl: string, authType: AuthType): string {
  if (!baseUrl) return baseUrl;

  // 1. 移除尾部斜杠，剥离所有已知 API 路径后缀，得到根 URL
  //    Remove trailing slashes, strip all known API path suffixes to get root URL
  const rootUrl = baseUrl
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
    .replace(/\/v1beta$/, '');

  // 2. 根据目标协议添加正确的路径后缀
  //    Add the correct path suffix for the target protocol
  switch (authType) {
    case AuthType.USE_OPENAI:
      // OpenAI SDK 需要带 /v1 的路径 / OpenAI SDK expects URL with /v1 path
      return `${rootUrl}/v1`;
    case AuthType.USE_GEMINI:
    case AuthType.USE_VERTEX_AI:
    case AuthType.USE_ANTHROPIC:
      // Gemini/Anthropic SDK 需要根 URL（它们会自动附加各自的路径）
      // Gemini/Anthropic SDKs need root URL (they append their own paths)
      return rootUrl;
    default:
      return rootUrl;
  }
}

export class ClientFactory {
  static async createRotatingClient(
    provider: TProviderWithModel,
    options: ClientOptions = {}
  ): Promise<RotatingClient> {
    const providerAuthType = getProviderAuthType(provider);
    const rotatingOptions = options.rotatingOptions || { maxRetries: 3, retryDelay: 1000 };

    // 对 new-api 网关进行 URL 规范化 / Normalize URL for new-api gateway
    const isNewApi = isNewApiPlatform(provider.platform);
    const authTypeForUrl: AuthType =
      providerAuthType === 'anthropic'
        ? AuthType.USE_ANTHROPIC
        : providerAuthType === 'vertex'
          ? AuthType.USE_VERTEX_AI
          : providerAuthType === 'gemini'
            ? AuthType.USE_GEMINI
            : AuthType.USE_OPENAI;
    let baseUrl = isNewApi ? normalizeNewApiBaseUrl(provider.baseUrl, authTypeForUrl) : provider.baseUrl;

    // Normalize baseUrl for OpenAI-compatible providers.
    // This avoids common 405 Not Allowed errors caused by missing /v1, and supports vendor modes like compatible-mode.
    if (providerAuthType === 'openai') {
      baseUrl = normalizeOpenAiCompatBaseUrl(baseUrl, (provider as { authTypeCustom?: string }).authTypeCustom);
    }

    switch (providerAuthType) {
      case 'openai': {
        const clientConfig: OpenAIClientConfig = {
          baseURL: baseUrl,
          timeout: options.timeout,
          defaultHeaders: {
            'HTTP-Referer': 'https://1one.ai',
            'X-Title': '1ONE ClaudeCode',
          },
          ...(options.baseConfig as OpenAIClientConfig),
        };

        // 添加代理配置（如果提供）
        if (options.proxy) {
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          clientConfig.httpAgent = new HttpsProxyAgent(options.proxy);
        }

        return new OpenAIRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }

      case 'gemini': {
        const clientConfig: GeminiClientConfig = {
          model: provider.useModel,
          baseURL: baseUrl,
          ...(options.baseConfig as GeminiClientConfig),
        };

        return new GeminiRotatingClient(provider.apiKey, clientConfig, rotatingOptions, AuthType.USE_GEMINI);
      }

      case 'vertex': {
        const clientConfig: GeminiClientConfig = {
          model: provider.useModel,
          // Note: Don't set baseURL for Vertex AI - it uses Google's built-in endpoints
          ...(options.baseConfig as GeminiClientConfig),
        };

        return new GeminiRotatingClient(provider.apiKey, clientConfig, rotatingOptions, AuthType.USE_VERTEX_AI);
      }

      case 'anthropic': {
        const clientConfig: AnthropicClientConfig = {
          model: provider.useModel,
          baseURL: baseUrl,
          timeout: options.timeout,
          ...(options.baseConfig as AnthropicClientConfig),
        };

        return new AnthropicRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }

      default: {
        // 默认使用OpenAI兼容协议
        const clientConfig: OpenAIClientConfig = {
          baseURL: baseUrl,
          timeout: options.timeout,
          defaultHeaders: {
            'HTTP-Referer': 'https://1one.ai',
            'X-Title': '1ONE ClaudeCode',
          },
          ...(options.baseConfig as OpenAIClientConfig),
        };

        // 添加代理配置（如果提供）
        if (options.proxy) {
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          clientConfig.httpAgent = new HttpsProxyAgent(options.proxy);
        }

        return new OpenAIRotatingClient(provider.apiKey, clientConfig, rotatingOptions);
      }
    }
  }
}
