/**
 * ACP session hints and helpers for built-in web fetch/search MCP tools.
 */

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>)\]]+/i;

export const ACP_WEB_TOOLS_REMINDER = [
  'For public web pages or web search, use MCP tools from server "one-web-tools":',
  '- one_web_fetch: when the user provides an http(s) URL to read or summarize',
  '- one_web_search: when the user asks to search the web or says 百度搜索 / 搜一下',
  'Do NOT use curl, wget, or shell to fetch URLs unless one-web-tools is unavailable.',
].join('\n');

export function userMessageNeedsWebTools(content: string): boolean {
  if (URL_IN_TEXT_RE.test(content)) {
    return true;
  }
  return /百度搜索|必应搜索|搜一下|搜索一下|联网搜索|web\s*search/i.test(content);
}

export function buildWebToolsReminderForUserMessage(content: string): string | null {
  if (!userMessageNeedsWebTools(content)) {
    return null;
  }
  return `<system-reminder>\n${ACP_WEB_TOOLS_REMINDER}\n</system-reminder>\n\n`;
}

/** Read-only curl/wget that only fetches a URL (safe to auto-approve). */
export function isReadOnlyUrlFetchCommand(command?: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }
  const trimmed = command.trim();
  if (!/https?:\/\//i.test(trimmed)) {
    return false;
  }
  if (!/\b(curl|wget)\b/i.test(trimmed)) {
    return false;
  }
  if (/\s(-X\s+POST|--request\s+POST|--data\b|-d\s|--upload|-T\s|>>?|\|)/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function pickAllowOnceOptionId(
  options: Array<{ optionId?: string; name?: string }> | undefined
): string {
  if (!options?.length) {
    return 'allow_once';
  }
  const preferOnce = options.find(
    (o) => o.optionId && /allow/i.test(o.optionId) && !/always|session/i.test(o.optionId)
  );
  if (preferOnce?.optionId) {
    return preferOnce.optionId;
  }
  const anyAllow = options.find((o) => o.optionId && /allow/i.test(o.optionId));
  return anyAllow?.optionId ?? options[0]?.optionId ?? 'allow_once';
}
