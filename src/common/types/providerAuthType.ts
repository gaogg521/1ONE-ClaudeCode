/**
 * Renderer-safe auth/protocol type for model providers.
 *
 * IMPORTANT:
 * - Do NOT import `@office-ai/aioncli-core` in the renderer bundle.
 * - This type is persisted in `model.config` and used for routing protocol decisions.
 */
export type ProviderAuthType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'vertex'
  | 'bedrock';

/**
 * UI-facing protocol choice.
 * - `custom`: user enters a vendor/gateway specific protocol/mode string (e.g. "compatible-mode")
 *   which will be resolved at runtime to a supported protocol (usually openai) for routing.
 */
/** Explicit OpenAI chat/completions wire format (LiteLLM doc: `protocol: "openai"`; HTTP: `liteLlmOpenAiProtocolHeaders`). */
export type ProviderAuthTypeChoice = ProviderAuthType | 'openai-completions' | 'custom';

export const PROVIDER_AUTH_TYPE_LABELS: Record<ProviderAuthType, string> = {
  openai: 'OpenAI (chat/completions)',
  anthropic: 'Anthropic (messages)',
  gemini: 'Gemini',
  vertex: 'Vertex AI',
  bedrock: 'AWS Bedrock',
};

