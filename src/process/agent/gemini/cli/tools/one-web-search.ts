/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';
import type {
  GeminiClient,
  ToolResult,
  ToolInvocation,
  ToolLocation,
  ToolCallConfirmationDetails,
  MessageBus,
} from '@office-ai/aioncli-core';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  getErrorMessage,
  ToolErrorType,
  DEFAULT_GEMINI_FLASH_MODEL,
  LlmRole,
} from '@office-ai/aioncli-core';
import {
  detectSearchEngineFromQuery,
  fetchSearchResultsAsPlainText,
  formatSourcesBlock,
  type SearchEngine,
} from '@/common/web/pageTools';
import { getResponseText } from './utils';

export type { SearchEngine } from '@/common/web/pageTools';
export { buildSearchEngineUrl, detectSearchEngineFromQuery } from '@/common/web/pageTools';

const ONE_WEB_SEARCH_TOOL_NAMES = new Set(['1one_web_search', 'WebSearch', 'web_search']);

const QUERY_ALIAS_KEYS = ['query', 'Query', 'q', 'keyword', 'keywords', 'search', 'text', 'prompt', 'question'] as const;

const ENGINE_ALIAS_KEYS = ['engine', 'Engine', 'search_engine', 'searchEngine', 'provider'] as const;

const NESTED_SEARCH_ARG_KEYS = ['input', 'parameters', 'arguments', 'params'] as const;

export function isOneWebSearchToolName(toolName: string): boolean {
  return ONE_WEB_SEARCH_TOOL_NAMES.has(toolName);
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

function unwrapNestedSearchArgs(args: Record<string, unknown>): Record<string, unknown> {
  let flat = { ...args };
  for (const key of NESTED_SEARCH_ARG_KEYS) {
    const nested = flat[key];
    if (isRecord(nested)) {
      flat = { ...flat, ...nested };
      delete flat[key];
    }
  }
  return flat;
}

function parseEngine(value: string | undefined): SearchEngine | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'baidu' || normalized === '百度') {
    return 'baidu';
  }
  if (normalized === 'bing' || normalized === '必应') {
    return 'bing';
  }
  if (normalized === 'duckduckgo' || normalized === 'ddg') {
    return 'duckduckgo';
  }
  return undefined;
}

export type NormalizeOneWebSearchOptions = {
  fallbackText?: string;
};

export function normalizeOneWebSearchToolParams(
  args: Record<string, unknown>,
  options?: NormalizeOneWebSearchOptions
): Record<string, unknown> {
  let flat = unwrapNestedSearchArgs(args);

  let query = pickFirstNonEmptyString(flat, QUERY_ALIAS_KEYS);
  if (query) {
    flat.query = query;
    for (const key of QUERY_ALIAS_KEYS) {
      if (key !== 'query' && key in flat) {
        delete flat[key];
      }
    }
  }

  const explicitEngine = parseEngine(pickFirstNonEmptyString(flat, ENGINE_ALIAS_KEYS));
  if (explicitEngine) {
    flat.engine = explicitEngine;
    for (const key of ENGINE_ALIAS_KEYS) {
      if (key !== 'engine' && key in flat) {
        delete flat[key];
      }
    }
  }

  if ((!query || !query.trim()) && options?.fallbackText) {
    const fallback = options.fallbackText.trim();
    if (fallback && !/^https?:\/\//i.test(fallback)) {
      flat.query = fallback;
      query = fallback;
    }
  }

  const queryText = typeof flat.query === 'string' ? flat.query : '';
  if (queryText) {
    const detected = detectSearchEngineFromQuery(queryText);
    flat.query = detected.query;
    if (!flat.engine) {
      flat.engine = detected.engine;
    }
  }

  if (!flat.engine) {
    flat.engine = 'baidu';
  }

  return flat;
}

export interface OneWebSearchToolParams {
  query: string;
  engine?: SearchEngine;
}

export class OneWebSearchTool extends BaseDeclarativeTool<OneWebSearchToolParams, ToolResult> {
  static readonly Name: string = '1one_web_search';

  constructor(
    private readonly geminiClient: GeminiClient,
    messageBus: MessageBus
  ) {
    super(
      OneWebSearchTool.Name,
      'WebSearch',
      'Search the public web without Google account login. Default engine is Baidu (百度). ' +
        'Use when the user asks to search the web, 百度搜索, or needs up-to-date information from the internet. ' +
        'Also use WebFetch (1one_web_fetch) when the user provides a direct URL. ' +
        'Parameters: query (required), engine optional (baidu | bing | duckduckgo).',
      Kind.Search,
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Search keywords or natural-language question to look up on the web.',
          },
          engine: {
            type: Type.STRING,
            description: 'Search engine: baidu (default), bing, or duckduckgo.',
          },
        },
        required: ['query'],
      },
      messageBus,
      true,
      false
    );
  }

  public override validateToolParams(params: OneWebSearchToolParams): string | null {
    const resolved = normalizeOneWebSearchToolParams(
      params as unknown as Record<string, unknown>
    ) as OneWebSearchToolParams;
    const query = typeof resolved.query === 'string' ? resolved.query.trim() : '';
    if (!query) {
      return (
        "The 'query' parameter is required. Pass search keywords (e.g. user request or 百度搜索 ...). " +
        'No Google login is needed.'
      );
    }
    return null;
  }

  protected createInvocation(
    params: OneWebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string
  ): ToolInvocation<OneWebSearchToolParams, ToolResult> {
    const resolved = normalizeOneWebSearchToolParams(
      params as unknown as Record<string, unknown>
    ) as OneWebSearchToolParams;
    return new OneWebSearchInvocation(this.geminiClient, resolved, messageBus, _toolName, _toolDisplayName);
  }
}

class OneWebSearchInvocation extends BaseToolInvocation<OneWebSearchToolParams, ToolResult> {
  constructor(
    private readonly geminiClient: GeminiClient,
    params: OneWebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const engine = this.params.engine ?? 'baidu';
    return `Searching the web (${engine}) for: "${this.params.query}"`;
  }

  override toolLocations(): ToolLocation[] {
    return [];
  }

  override async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  private async executeSearch(signal: AbortSignal): Promise<ToolResult> {
    const engine = this.params.engine ?? 'baidu';
    const { searchUrl, text: textContent, query: resolvedQuery, resultLinks } =
      await fetchSearchResultsAsPlainText(this.params.query, engine);
    const sourcesBlock = formatSourcesBlock(searchUrl, resultLinks);
    if (signal.aborted) {
      return {
        llmContent: 'Web search was cancelled by user.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    const processPrompt = `The user asked to search the web for: "${resolvedQuery}" (engine: ${engine}).

Below is text extracted from the search results page (${searchUrl}). Summarize the most relevant findings for the user's request. If results look empty or blocked, say so clearly.

---
${textContent}
---

Include a short "Sources:" section listing the reference URLs below.

${sourcesBlock}`;

    const result = await this.geminiClient.generateContent(
      { model: DEFAULT_GEMINI_FLASH_MODEL },
      [{ role: 'user', parts: [{ text: processPrompt }] }],
      signal,
      LlmRole.UTILITY_TOOL
    );
    const resultText = getResponseText(result) || '';
    return {
      llmContent: resultText,
      returnDisplay: `Web search (${engine}) completed for: ${resolvedQuery}\n${sourcesBlock}`,
    };
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Web search was cancelled by user before it could start.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    try {
      const engine = this.params.engine ?? 'baidu';
      updateOutput?.(`Searching (${engine}) for: "${this.params.query}"...`);
      return await this.executeSearch(signal);
    } catch (error) {
      if (signal.aborted) {
        return {
          llmContent: 'Web search was cancelled by user.',
          returnDisplay: 'Operation cancelled by user.',
        };
      }

      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error performing web search: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}
