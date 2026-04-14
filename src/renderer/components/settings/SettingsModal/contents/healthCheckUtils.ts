/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Classification result for a health check response message.
 *
 * - `'skip'`    – message is metadata or stream-start; ignore and keep waiting.
 * - `'error'`   – API returned an error; health check failed.
 * - `'success'` – first real response chunk arrived; health check passed.
 */
export type HealthCheckAction = 'skip' | 'error' | 'success';

/**
 * Classify a response message type for health check determination.
 *
 * `request_trace` and `start` are infrastructure events emitted before any
 * actual API response — they must be skipped so the health check waits for
 * a real content chunk or an error from the upstream API.
 */
export function classifyHealthCheckMessage(type: string): HealthCheckAction {
  if (type === 'request_trace' || type === 'start') {
    return 'skip';
  }
  if (type === 'error') {
    return 'error';
  }
  return 'success';
}

export type HealthCheckHint =
  | { kind: 'missing_v1'; message: string }
  | { kind: 'unsupported_operation'; message: string }
  | { kind: 'protocol_mismatch'; message: string }
  | { kind: 'generic'; message: string };

/**
 * Convert raw API error text into an actionable hint message.
 * This is intentionally heuristic: we prefer a helpful "what to do next" over perfect parsing.
 */
export function buildHealthCheckHint(
  rawError: string,
  t: (key: string, params?: Record<string, string>) => string
): HealthCheckHint {
  const text = String(rawError || '');
  const lower = text.toLowerCase();

  // 405 Not Allowed typically means baseUrl points to a path that doesn't accept POST,
  // most commonly missing the /v1 suffix for OpenAI-compatible endpoints.
  if (lower.includes('405') && lower.includes('not allowed')) {
    return {
      kind: 'missing_v1',
      message: t('settings.healthCheckHint405', {
        defaultValue: '405：baseUrl 路径不对（常见是缺少 /v1）。请检查 baseUrl 是否为 .../v1（或厂商要求的兼容路径）。',
      }),
    };
  }

  // Gateways often wrap upstream 400 as 502. This specific message is common when the server
  // doesn't support chat/completions for that model/route.
  if (lower.includes('unsupported') && lower.includes('operation')) {
    return {
      kind: 'unsupported_operation',
      message: t('settings.healthCheckHintUnsupported', {
        defaultValue:
          '该模型/线路不支持当前请求操作（通常是不支持 OpenAI chat/completions）。请尝试换模型、换网关路由，或切换为厂商兼容模式（如 compatible-mode）。',
      }),
    };
  }

  // Protocol mismatch: model only supports OpenAI but request was Anthropic/Claude, etc.
  if (lower.includes('does not support') && lower.includes('protocol') && lower.includes('only supports')) {
    return {
      kind: 'protocol_mismatch',
      message: t('settings.healthCheckHintProtocolMismatch', {
        defaultValue:
          '协议不匹配：该模型仅支持 OpenAI 协议。请在“请求协议”里选择 OpenAI，或为该模型配置协议覆盖。',
      }),
    };
  }

  return {
    kind: 'generic',
    message: t('settings.healthCheckHintGeneric', { defaultValue: '请检查 API Key、baseUrl、请求协议/模式与网关路由是否匹配。' }),
  };
}
