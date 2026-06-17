/**
 * Server-side web prefetch for ACP sessions — fetches URL/search in the main process
 * so models that lack MCP tools (Kimi, MiniMax, etc.) still receive page content.
 */

import { userMessageNeedsWebTools } from './acpWebToolsHint';
import {
  detectSearchEngineFromQuery,
  extractUrlFromText,
  fetchSearchResultsAsPlainText,
  fetchUrlAsPlainText,
  formatSourcesBlock,
} from './pageTools';

const PREFETCH_URL_MAX_CHARS = 50_000;
const PREFETCH_SEARCH_MAX_CHARS = 30_000;

const SEARCH_INTENT_RE = /百度搜索|必应搜索|搜一下|搜索一下|联网搜索|web\s*search/i;

export type WebPrefetchFetchResult = {
  kind: 'fetch';
  url: string;
  text: string;
  block: string;
};

export type WebPrefetchSearchResult = {
  kind: 'search';
  searchUrl: string;
  query: string;
  resultLinks: string[];
  text: string;
  block: string;
};

export type WebPrefetchResult = WebPrefetchFetchResult | WebPrefetchSearchResult;

function formatFetchBlock(resolvedUrl: string, text: string): string {
  return (
    `<1one-web-context>\n` +
    `1ONE fetched this public web page before your reply. Use the content below; do not say you cannot access URLs.\n\n` +
    `URL: ${resolvedUrl}\n---\n${text}\n---\n</1one-web-context>\n\n`
  );
}

function formatFetchErrorBlock(url: string, message: string): string {
  return (
    `<1one-web-context>\n` +
    `1ONE attempted to fetch ${url} but failed: ${message}\n` +
    `Tell the user fetch failed and suggest checking the URL or network.\n</1one-web-context>\n\n`
  );
}

function formatSearchBlock(searchUrl: string, query: string, resultLinks: string[], text: string): string {
  const sources = formatSourcesBlock(searchUrl, resultLinks);
  return (
    `<1one-web-context>\n` +
    `1ONE ran a web search before your reply. Use the results below; do not say you cannot search the web.\n\n` +
    `Query: ${query}\n${sources}\n---\n${text}\n---\n</1one-web-context>\n\n`
  );
}

function formatSearchErrorBlock(query: string, message: string): string {
  return (
    `<1one-web-context>\n` + `1ONE attempted web search for "${query}" but failed: ${message}\n</1one-web-context>\n\n`
  );
}

/** Whether this user message should trigger server-side prefetch (URL or explicit search). */
export function shouldPrefetchWebContext(content: string): boolean {
  if (extractUrlFromText(content)) {
    return true;
  }
  return userMessageNeedsWebTools(content) && SEARCH_INTENT_RE.test(content);
}

/**
 * Fetch URL or search results in-process and return a block to prepend to the user prompt.
 */
export async function prefetchWebContextForUserMessage(content: string): Promise<WebPrefetchResult | null> {
  if (!shouldPrefetchWebContext(content)) {
    return null;
  }

  const url = extractUrlFromText(content);
  if (url) {
    try {
      const { url: resolved, text } = await fetchUrlAsPlainText(url, PREFETCH_URL_MAX_CHARS);
      return { kind: 'fetch', url: resolved, text, block: formatFetchBlock(resolved, text) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'fetch', url, text: '', block: formatFetchErrorBlock(url, message) };
    }
  }

  if (SEARCH_INTENT_RE.test(content)) {
    try {
      const { searchUrl, text, resultLinks, query } = await fetchSearchResultsAsPlainText(
        content,
        'baidu',
        PREFETCH_SEARCH_MAX_CHARS
      );
      return {
        kind: 'search',
        searchUrl,
        query,
        resultLinks,
        text,
        block: formatSearchBlock(searchUrl, query, resultLinks, text),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { query } = detectSearchEngineFromQuery(content);
      return {
        kind: 'search',
        searchUrl: '',
        query: query || content.slice(0, 200),
        resultLinks: [],
        text: '',
        block: formatSearchErrorBlock(query || content.slice(0, 80), message),
      };
    }
  }

  return null;
}
