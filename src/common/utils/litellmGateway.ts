/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNewApiPlatform } from '@/common/utils/platformConstants';

/**
 * Fields sufficient to detect a LiteLLM (or compatible) OpenAI gateway.
 * LiteLLM fronts many upstreams (incl. Gemini) via `/v1/chat/completions` with a single API key —
 * 1ONE must not run native Google OAuth / Vertex credential flows for these providers.
 */
export type LiteLlmProbeProvider = {
  baseUrl?: string;
  name?: string;
  litellmProxy?: boolean;
  authTypeCustom?: string;
  /** Current model id (e.g. `litellm/gemini-3.1-pro-preview`). */
  useModel?: string;
  /** Provider model list from settings (same naming convention supported). */
  model?: string[];
};

const LITELLM_MODEL_PREFIX = 'litellm/';

/**
 * True when a LiteLLM model id uses the `litellm/<upstream-model>` convention (case-insensitive prefix).
 */
export function modelIdLooksLikeLitellmProxy(modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  return modelId.toLowerCase().startsWith(LITELLM_MODEL_PREFIX);
}

/**
 * True when traffic is intended to go through a LiteLLM-style OpenAI proxy (API key only).
 *
 * - Explicit `litellmProxy: true` on the saved provider (for internal hostnames without "litellm").
 * - Model id convention: `useModel` or any entry in `model` is `litellm/<name>` (e.g. `litellm/gemini-3.1-pro-preview`).
 * - Heuristic: `baseUrl`, display `name`, or `authTypeCustom` contains "litellm" (case-insensitive).
 */

/**
 * LiteLLM gateway “工具封装”侧推荐的配置形态（逻辑等价；实际 HTTP 由 ClientFactory / OneAgent 拼装）。
 * HTTP: `POST {base_url}/v1/chat/completions`，`Content-Type: application/json`，并附带 {@link liteLlmOpenAiProtocolHeaders}。
 */
export const LITELLM_OPENAI_WRAPPER_CONFIG_EXAMPLE = {
  base_url: 'https://your-domain.com',
  api_key: 'xxx',
  model: 'gpt-4o-mini',
  endpoint: '/v1/chat/completions',
  protocol: 'openai',
  content_type: 'application/json',
} as const;

/**
 * Extra headers for new-api / LiteLLM relays: OpenAI chat/completions wire (not Anthropic).
 * - Primary: `Api: openai-completions` (common new-api relay convention).
 * - Also: `Protocol: openai` (LiteLLM tool-wrapper doc `protocol: "openai"` equivalent).
 * Both are sent so gateways that honor either header behave correctly.
 */
export function liteLlmOpenAiProtocolHeaders(): Record<string, string> {
  return { Api: 'openai-completions', Protocol: 'openai' };
}

export function shouldAttachLiteLlmOpenAiProtocolHeader(provider: { platform: string } & LiteLlmProbeProvider): boolean {
  return isNewApiPlatform(provider.platform) || isProviderLiteLlmProxy(provider);
}

/** @deprecated Use {@link shouldAttachLiteLlmOpenAiProtocolHeader} — behavior unchanged, name reflects LiteLLM doc. */
export function shouldSendOpenAiCompletionsApiHeader(provider: { platform: string } & LiteLlmProbeProvider): boolean {
  return shouldAttachLiteLlmOpenAiProtocolHeader(provider);
}

export function isProviderLiteLlmProxy(provider: LiteLlmProbeProvider | null | undefined): boolean {
  if (!provider) return false;
  if (provider.litellmProxy === true) return true;
  if (modelIdLooksLikeLitellmProxy(provider.useModel)) return true;
  if (Array.isArray(provider.model) && provider.model.some((m) => modelIdLooksLikeLitellmProxy(m))) return true;
  const bu = (provider.baseUrl || '').toLowerCase();
  if (bu.includes('litellm')) return true;
  const nm = (provider.name || '').toLowerCase();
  if (nm.includes('litellm')) return true;
  const custom = (provider.authTypeCustom || '').toLowerCase();
  if (custom.includes('litellm')) return true;
  return false;
}
