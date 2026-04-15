/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { isProviderLiteLlmProxy } from '@/common/utils/litellmGateway';
import { isOpenAIHost } from '@/common/utils/urlValidation';
import type { ProviderAuthTypeChoice } from '@/common/types/providerAuthType';

type AionrsProvider = 'anthropic' | 'openai' | 'bedrock' | 'vertex';

/**
 * Map 1ONE ClaudeCode platform name to aionrs provider name.
 *
 * 1ONE PlatformType values: 'custom' | 'new-api' | 'gemini' | 'gemini-vertex-ai' | 'anthropic' | 'bedrock'
 */
function mapProvider(model: TProviderWithModel): AionrsProvider {
  if (isProviderLiteLlmProxy(model)) {
    return 'openai';
  }
  // Respect explicit authType override (protocol selection in UI).
  // This is critical for gateway endpoints (LiteLLM/new-api) where the same baseUrl can host
  // multiple upstream protocols.
  const authType = (model as { authType?: ProviderAuthTypeChoice }).authType;
  if (authType) {
    if (authType === 'openai-completions') return 'openai';
    if (authType === 'anthropic') return 'anthropic';
    if (authType === 'bedrock') return 'bedrock';
    if (authType === 'vertex') return 'vertex';
    if (authType === 'custom') return 'openai';
    return 'openai';
  }

  const mapping: Record<string, AionrsProvider> = {
    anthropic: 'anthropic',
    bedrock: 'bedrock',
    'gemini-vertex-ai': 'vertex',
    // Gemini uses OpenAI-compatible endpoint
    gemini: 'openai',
    // custom / new-api use OpenAI-compatible protocol
    custom: 'openai',
    'new-api': 'openai',
  };
  return mapping[model.platform] ?? 'openai';
}

const GEMINI_OPENAI_COMPAT_PATH = '/v1beta/openai';

/**
 * Resolve base URL for OpenAI-compatible providers.
 * For Gemini, ensure the URL includes the `/v1beta/openai` path suffix.
 */
function resolveOpenAIBaseUrl(model: TProviderWithModel): string {
  if (model.platform === 'gemini' && !isProviderLiteLlmProxy(model)) {
    const raw = (model.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    return raw.endsWith(GEMINI_OPENAI_COMPAT_PATH) ? raw : `${raw}${GEMINI_OPENAI_COMPAT_PATH}`;
  }
  return model.baseUrl || '';
}

/**
 * Strip trailing `/v1` (with optional trailing slash) from a base URL.
 * aionrs appends `/v1/chat/completions` internally, so passing a URL
 * that already ends with `/v1` would produce a double `/v1/v1/…` path.
 */
function stripTrailingV1(url: string): string {
  return url.replace(/\/v1\/?$/, '');
}

/**
 * Build CLI args and env vars for spawning aionrs.
 */
export function buildSpawnConfig(
  model: TProviderWithModel,
  options: {
    workspace: string;
    maxTokens?: number;
    maxTurns?: number;
    systemPrompt?: string;
    autoApprove?: boolean;
    sessionId?: string;
    resume?: string;
  }
): { args: string[]; env: Record<string, string>; projectConfig: string } {
  const provider = mapProvider(model);
  const env: Record<string, string> = {};
  const args: string[] = ['--json-stream', '--provider', provider, '--model', model.useModel];

  if (options.maxTokens) {
    args.push('--max-tokens', String(options.maxTokens));
  }
  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns));
  }
  if (options.autoApprove) {
    args.push('--auto-approve');
  }

  // --resume and --session-id are mutually exclusive
  if (options.resume) {
    args.push('--resume', options.resume);
  } else if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }

  // For OpenAI-compatible providers (custom/LiteLLM/Gemini), override the binary's
  // default Claude identity with a neutral system prompt.
  // Anthropic keeps its own default (no override needed).
  // Use a more explicit prompt that discourages unnecessary tool use —
  // some models (e.g. doubao-seed) trigger tool-call bugs when they explore the workspace
  // unprompted, leading to tool_call_id errors.
  const neutralSystemPrompt =
    provider !== 'anthropic'
      ? [
          'You are a helpful AI assistant. Answer questions directly.',
          'Only use file system tools when the user explicitly asks you to read, write, or execute files.',
          'For project/directory structure: ALWAYS use `git ls-files` first (fastest). If git is not available, run shallow one-level listings like `dir /b` or `ls` on specific subdirs — NEVER run `dir /s /b`, `dir /s`, `find` or any unbounded recursive command on the workspace root; these time out at 120 s and block all work.',
          'Do NOT try to read binary or image files with file_read or bash — they contain binary data that cannot be interpreted as text.',
          'Do NOT make up information. If you cannot retrieve real-time data (weather, stock prices, live URLs) because you have no web-search tool, tell the user clearly instead of guessing.',
        ].join(' ')
      : undefined;
  const effectiveSystemPrompt = options.systemPrompt ?? neutralSystemPrompt;
  if (effectiveSystemPrompt) {
    args.push('--system-prompt', effectiveSystemPrompt);
  }

  // Some "seed" / deep-thinking models (e.g. doubao-seed-2-pro) have a known bug
  // in LiteLLM's doubao adapter: tool_call_id is missing from forwarded messages,
  // causing cascading 400 errors after the first tool call.
  // Cap max-turns to 1 for these models to prevent the loop from hanging.
  const useModelLower = (model.useModel ?? '').toLowerCase();
  const isSeedModel = useModelLower.includes('seed') || useModelLower.includes('thinking') || useModelLower.includes('reasoner');
  if (isSeedModel && !options.maxTurns) {
    args.push('--max-turns', '1');
  }

  // Set auth credentials and base URL via CLI args and env vars.
  // aionrs reads: --api-key / API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
  //               --base-url / BASE_URL (NOT OPENAI_BASE_URL)
  // aionrs appends `/v1/chat/completions` to base_url, so URLs that already
  // end with `/v1` (e.g. DashScope) must be stripped to avoid double `/v1`.
  switch (provider) {
    case 'anthropic':
      if (model.apiKey) env.ANTHROPIC_API_KEY = model.apiKey;
      if (model.baseUrl) args.push('--base-url', stripTrailingV1(model.baseUrl));
      break;

    case 'openai': {
      if (model.apiKey) env.OPENAI_API_KEY = model.apiKey;
      const baseUrl = resolveOpenAIBaseUrl(model);
      if (baseUrl) args.push('--base-url', stripTrailingV1(baseUrl));
      break;
    }

    case 'bedrock': {
      const bc = (model as TProviderWithModel & { bedrockConfig?: any }).bedrockConfig;
      if (bc) {
        if (bc.region) env.AWS_REGION = bc.region;
        if (bc.authMethod === 'accessKey') {
          if (bc.accessKeyId) env.AWS_ACCESS_KEY_ID = bc.accessKeyId;
          if (bc.secretAccessKey) env.AWS_SECRET_ACCESS_KEY = bc.secretAccessKey;
        } else if (bc.authMethod === 'profile' && bc.profile) {
          env.AWS_PROFILE = bc.profile;
        }
      }
      break;
    }

    case 'vertex':
      // Vertex uses service account or ADC — no explicit env vars needed
      break;
  }

  // Generate project config for compat overrides (e.g., max_tokens_field)
  const projectConfig = buildProjectConfig(model, provider);

  return { args, env, projectConfig };
}

/**
 * Build `.aionrs.toml` project config for the OpenAI provider path.
 *
 * - **api = "openai-completions"** — forces aionrs to use OpenAI `/v1/chat/completions` wire format.
 *   Aligns with LiteLLM “工具封装”建议里的 `protocol: "openai"` + `endpoint: "/v1/chat/completions"`.
 *   Gateways (LiteLLM/new-api) often reject `anthropic` / `claude_code` style protocols; this must not
 *   be inferred as Anthropic when the HTTP surface is OpenAI-compatible.
 * - `[providers.openai.compat]` — Gemini path segment, `max_completion_tokens`, etc.
 */
function buildProjectConfig(model: TProviderWithModel, provider: AionrsProvider): string {
  if (provider !== 'openai') return '';

  const chunks: string[] = [
    '[providers.openai]',
    'api = "openai-completions"',
    '',
  ];

  const compat: string[] = [];

  // Gemini uses /v1beta/openai as base URL — skip the default /v1 prefix
  if (model.platform === 'gemini' && !isProviderLiteLlmProxy(model)) {
    compat.push('api_path = "/chat/completions"');
  }

  const baseUrl = model.baseUrl || '';
  const useModelLower = (model.useModel ?? '').toLowerCase();
  const needsMaxCompletionTokens =
    useModelLower.startsWith('gpt-5') ||
    useModelLower.startsWith('o1') ||
    useModelLower.startsWith('o3') ||
    useModelLower.includes('codex');

  if ((baseUrl && isOpenAIHost(baseUrl)) || needsMaxCompletionTokens) {
    compat.push('max_tokens_field = "max_completion_tokens"');
  }

  if (compat.length > 0) {
    chunks.push('[providers.openai.compat]', ...compat, '');
  }

  return chunks.join('\n');
}
