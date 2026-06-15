/**
 * Shared HTTP page fetch + search URL helpers for WebFetch / WebSearch (Gemini tools & builtin MCP).
 */

import { convert } from 'html-to-text';

export type SearchEngine = 'baidu' | 'bing' | 'duckduckgo';

export const PAGE_FETCH_TIMEOUT_MS = 15000;

export const PAGE_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml',
};

const BAIDU_PREFIX_RE = /^(?:请?用?)?百度(?:搜索|查询|一下)?[:：\s]*/i;
const BING_PREFIX_RE = /^(?:请?用?)?必应(?:搜索|查询)?[:：\s]*/i;

const URL_FROM_TEXT_RE = /https?:\/\/[^\s"'<>)\]]+/i;

export function extractUrlFromText(text: string): string | undefined {
  return text.match(URL_FROM_TEXT_RE)?.[0];
}

export function detectSearchEngineFromQuery(rawQuery: string): { engine: SearchEngine; query: string } {
  let query = rawQuery.trim();
  let engine: SearchEngine = 'baidu';

  if (BAIDU_PREFIX_RE.test(query)) {
    engine = 'baidu';
    query = query.replace(BAIDU_PREFIX_RE, '').trim();
  } else if (BING_PREFIX_RE.test(query)) {
    engine = 'bing';
    query = query.replace(BING_PREFIX_RE, '').trim();
  } else if (/duckduckgo|ddg/i.test(query)) {
    engine = 'duckduckgo';
  }

  return { engine, query };
}

export function buildSearchEngineUrl(engine: SearchEngine, query: string): string {
  const encoded = encodeURIComponent(query.trim());
  switch (engine) {
    case 'baidu':
      return `https://www.baidu.com/s?wd=${encoded}`;
    case 'bing':
      return `https://www.bing.com/search?q=${encoded}`;
    case 'duckduckgo':
      return `https://html.duckduckgo.com/html/?q=${encoded}`;
    default: {
      const _exhaustive: never = engine;
      return _exhaustive;
    }
  }
}

export async function fetchPageHtml(url: string, timeoutMs: number = PAGE_FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: PAGE_FETCH_HEADERS,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function htmlToPlainText(html: string, maxLength = 100000): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
    ],
  }).substring(0, maxLength);
}

export function normalizeFetchUrl(url: string): string {
  let normalized = url.trim();
  try {
    const parsedUrl = new URL(normalized);
    if (
      (parsedUrl.hostname === 'github.com' || parsedUrl.hostname === 'www.github.com') &&
      parsedUrl.pathname.includes('/blob/')
    ) {
      normalized = normalized.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
  } catch {
    // keep original; fetch will surface invalid URL
  }
  return normalized;
}

export async function fetchUrlAsPlainText(url: string, maxLength = 100000): Promise<{ url: string; text: string }> {
  const normalized = normalizeFetchUrl(url);
  const html = await fetchPageHtml(normalized);
  return { url: normalized, text: htmlToPlainText(html, maxLength) };
}

function shouldKeepResultLink(url: string, searchPageUrl: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    if (url === searchPageUrl) {
      return false;
    }
    const path = parsed.pathname.toLowerCase();
    if (/\.(css|js|png|jpe?g|gif|svg|webp|woff2?|ico)(\?|$)/.test(path)) {
      return false;
    }
    if (parsed.hostname.includes('baidu.com') && !parsed.hostname.includes('baike.baidu.com')) {
      if (path.startsWith('/s') || path.startsWith('/link')) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Parse outbound result links from a search engine results HTML page. */
export function extractSearchResultLinks(html: string, searchPageUrl: string, limit = 8): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const hrefRe = /href=["'](https?:\/\/[^"'#]+)["']/gi;
  let match = hrefRe.exec(html);
  while (match !== null) {
    const url = match[1].replace(/&amp;/g, '&');
    if (shouldKeepResultLink(url, searchPageUrl) && !seen.has(url)) {
      seen.add(url);
      found.push(url);
      if (found.length >= limit) {
        break;
      }
    }
    match = hrefRe.exec(html);
  }
  return found;
}

export function formatSourcesBlock(searchPageUrl: string, resultLinks: string[]): string {
  const lines = [`Sources: ${searchPageUrl}`];
  for (const link of resultLinks) {
    lines.push(link);
  }
  return lines.join('\n');
}

export async function fetchSearchResultsAsPlainText(
  query: string,
  engine: SearchEngine = 'baidu',
  maxLength = 100000
): Promise<{
  engine: SearchEngine;
  query: string;
  searchUrl: string;
  text: string;
  resultLinks: string[];
}> {
  const detected = detectSearchEngineFromQuery(query);
  const resolvedEngine = engine ?? detected.engine;
  const resolvedQuery = detected.query || query;
  const searchUrl = buildSearchEngineUrl(resolvedEngine, resolvedQuery);
  const html = await fetchPageHtml(searchUrl);
  const resultLinks = extractSearchResultLinks(html, searchUrl);
  return {
    engine: resolvedEngine,
    query: resolvedQuery,
    searchUrl,
    text: htmlToPlainText(html, maxLength),
    resultLinks,
  };
}
