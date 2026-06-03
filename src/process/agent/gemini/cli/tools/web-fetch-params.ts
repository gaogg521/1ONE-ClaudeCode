/**
 * Normalize WebFetch / web_fetch tool arguments from heterogeneous model outputs.
 */

const WEB_FETCH_TOOL_NAMES = new Set(['1one_web_fetch', 'web_fetch', 'WebFetch']);

const URL_FROM_TEXT_RE = /https?:\/\/[^\s"'<>)\]]+/i;

const URL_ALIAS_KEYS = ['url', 'URL', 'uri', 'URI', 'link', 'href', 'website', 'address', 'target'] as const;

const PROMPT_ALIAS_KEYS = [
  'prompt',
  'Prompt',
  'query',
  'instruction',
  'task',
  'description',
  'message',
  'text',
  'content',
] as const;

const NESTED_ARG_KEYS = ['input', 'parameters', 'arguments', 'params'] as const;

export function isWebFetchToolName(toolName: string): boolean {
  return WEB_FETCH_TOOL_NAMES.has(toolName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickFirstNonEmptyString(
  source: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function unwrapNestedArgs(args: Record<string, unknown>): Record<string, unknown> {
  let flat = { ...args };
  for (const key of NESTED_ARG_KEYS) {
    const nested = flat[key];
    if (isRecord(nested)) {
      flat = { ...flat, ...nested };
      delete flat[key];
    }
  }
  return flat;
}

function extractUrlFromText(text: string): string | undefined {
  const match = text.match(URL_FROM_TEXT_RE);
  return match?.[0];
}

export type NormalizeWebFetchOptions = {
  /** Recent user message text — used when the model omits url in tool arguments */
  fallbackText?: string;
};

/**
 * Map alternate field names and nested shapes to { url, prompt } expected by WebFetchTool.
 */
export function normalizeWebFetchToolParams(
  args: Record<string, unknown>,
  options?: NormalizeWebFetchOptions
): Record<string, unknown> {
  let flat = unwrapNestedArgs(args);

  const url = pickFirstNonEmptyString(flat, URL_ALIAS_KEYS);
  if (url) {
    flat.url = url;
    for (const key of URL_ALIAS_KEYS) {
      if (key !== 'url' && key in flat) {
        delete flat[key];
      }
    }
  }

  const prompt = pickFirstNonEmptyString(flat, PROMPT_ALIAS_KEYS);
  if (prompt) {
    flat.prompt = prompt;
    for (const key of PROMPT_ALIAS_KEYS) {
      if (key !== 'prompt' && key in flat) {
        delete flat[key];
      }
    }
  }

  if (typeof flat.url !== 'string' || !flat.url.trim()) {
    const promptText = typeof flat.prompt === 'string' ? flat.prompt : undefined;
    const fromPrompt = promptText ? extractUrlFromText(promptText) : undefined;
    if (fromPrompt) {
      flat.url = fromPrompt;
    }
  }

  if (typeof flat.prompt !== 'string' || !flat.prompt.trim()) {
    flat.prompt = 'Extract and summarize the information requested by the user from this page.';
  }

  const urlMissing = typeof flat.url !== 'string' || !flat.url.trim();
  if (urlMissing && options?.fallbackText) {
    const fromContext = extractUrlFromText(options.fallbackText);
    if (fromContext) {
      flat.url = fromContext;
    }
  }

  return flat;
}
