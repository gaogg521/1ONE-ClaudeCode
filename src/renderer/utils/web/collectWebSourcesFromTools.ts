/**
 * Extract web fetch/search source URLs from Gemini tool_group and ACP tool_call messages.
 */

import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';

export type WebSourceItem = {
  url: string;
  title: string;
};

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>)\]]+/gi;

const WEB_TOOL_NAME_RE =
  /^(1one_web_search|1one_web_fetch|WebSearch|WebFetch|web_fetch|google_web_search|gemini_web_search|one_web_search|one_web_fetch)$/i;

const WEB_TOOL_TITLE_RE = /web\s*search|web\s*fetch|one[-_]?web|百度搜索|网页抓取/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.includes('baidu.com') && parsed.pathname.startsWith('/s')) {
      return '百度搜索';
    }
    if (host.includes('bing.com') && parsed.pathname.includes('/search')) {
      return '必应搜索';
    }
    if (host.includes('duckduckgo.com')) {
      return 'DuckDuckGo';
    }
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return path ? `${host}${path.length > 48 ? `${path.slice(0, 45)}…` : path}` : host;
  } catch {
    return url.length > 56 ? `${url.slice(0, 53)}…` : url;
  }
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_IN_TEXT_RE);
  return matches ? matches.map((u) => u.replace(/[.,;:!?)]+$/, '')) : [];
}

const MAX_SOURCES = 12;

function shouldKeepSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    const path = parsed.pathname.toLowerCase();
    if (/\.(css|js|png|jpe?g|gif|svg|webp|woff2?|ico|map)(\?|$)/.test(path)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function addUrl(ordered: WebSourceItem[], seen: Set<string>, url: string): void {
  const trimmed = url.trim();
  if (!shouldKeepSourceUrl(trimmed)) {
    return;
  }
  if (seen.has(trimmed)) {
    return;
  }
  if (ordered.length >= MAX_SOURCES) {
    return;
  }
  seen.add(trimmed);
  ordered.push({ url: trimmed, title: titleFromUrl(trimmed) });
}

function collectFromArgs(args: unknown, ordered: WebSourceItem[], seen: Set<string>): void {
  if (!isRecord(args)) {
    return;
  }
  if (typeof args.url === 'string') {
    addUrl(ordered, seen, args.url);
  }
  if (typeof args.link === 'string') {
    addUrl(ordered, seen, args.link);
  }
  if (typeof args.href === 'string') {
    addUrl(ordered, seen, args.href);
  }
  for (const text of extractUrlsFromText(JSON.stringify(args))) {
    addUrl(ordered, seen, text);
  }
}

function isWebGeminiTool(name: string): boolean {
  return WEB_TOOL_NAME_RE.test(name) || WEB_TOOL_TITLE_RE.test(name);
}

function isReadOnlyUrlShellCommand(command: string): boolean {
  return /\b(curl|wget)\b/i.test(command) && /https?:\/\//i.test(command);
}

function isWebAcpTool(title: string, kind?: string, rawInput?: Record<string, unknown>): boolean {
  if (WEB_TOOL_NAME_RE.test(title) || WEB_TOOL_TITLE_RE.test(title)) {
    return true;
  }
  if (kind === 'fetch' || kind === 'search') {
    return true;
  }
  if (rawInput && typeof rawInput.command === 'string' && isReadOnlyUrlShellCommand(rawInput.command)) {
    return true;
  }
  if (rawInput && (typeof rawInput.url === 'string' || typeof rawInput.query === 'string')) {
    return WEB_TOOL_TITLE_RE.test(title) || /one[-_]?web/i.test(title);
  }
  return false;
}

function collectFromGeminiToolGroup(message: IMessageToolGroup, ordered: WebSourceItem[], seen: Set<string>): void {
  for (const tool of message.content) {
    if (!isWebGeminiTool(tool.name)) {
      continue;
    }
    if (tool.status !== 'Success') {
      continue;
    }
    const toolArgs = (tool as { args?: unknown }).args;
    if (toolArgs !== undefined) {
      collectFromArgs(toolArgs, ordered, seen);
    }
    if (typeof tool.description === 'string') {
      for (const url of extractUrlsFromText(tool.description)) {
        addUrl(ordered, seen, url);
      }
    }
    const display = tool.resultDisplay;
    if (typeof display === 'string') {
      for (const url of extractUrlsFromText(display)) {
        addUrl(ordered, seen, url);
      }
    }
  }
}

function collectFromAcpToolCall(message: IMessageAcpToolCall, ordered: WebSourceItem[], seen: Set<string>): void {
  const update = message.content?.update;
  if (!update || update.status !== 'completed') {
    return;
  }
  const title = update.title || '';
  if (!isWebAcpTool(title, update.kind, update.rawInput)) {
    return;
  }
  collectFromArgs(update.rawInput, ordered, seen);
  if (update.content?.length) {
    for (const block of update.content) {
      if (block.type === 'content' && block.content?.type === 'text' && block.content.text) {
        for (const url of extractUrlsFromText(block.content.text)) {
          addUrl(ordered, seen, url);
        }
      }
    }
  }
}

/**
 * Collect unique source URLs from a batch of tool messages (preceding an AI reply).
 */
export function collectWebSourcesFromToolMessages(
  messages: Array<IMessageToolGroup | IMessageAcpToolCall>
): WebSourceItem[] {
  const ordered: WebSourceItem[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.type === 'tool_group') {
      collectFromGeminiToolGroup(message, ordered, seen);
    } else if (message.type === 'acp_tool_call') {
      collectFromAcpToolCall(message, ordered, seen);
    }
  }

  return ordered;
}
