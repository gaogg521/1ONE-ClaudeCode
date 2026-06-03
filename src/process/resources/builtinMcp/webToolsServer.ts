/**
 * Built-in MCP server: web fetch + web search (Baidu/Bing, no Google login).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  extractUrlFromText,
  fetchSearchResultsAsPlainText,
  fetchUrlAsPlainText,
  formatSourcesBlock,
  type SearchEngine,
} from '@/common/web/pageTools';
import { BUILTIN_WEB_TOOLS_NAME } from './constants';

const SEARCH_ENGINES = ['baidu', 'bing', 'duckduckgo'] as const;

function parseEngine(value: string | undefined): SearchEngine | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'baidu' || normalized === '百度') return 'baidu';
  if (normalized === 'bing' || normalized === '必应') return 'bing';
  if (normalized === 'duckduckgo' || normalized === 'ddg') return 'duckduckgo';
  return undefined;
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_WEB_TOOLS_NAME,
    version: '1.0.0',
  });

  server.tool(
    'one_web_fetch',
    `Fetch a public web page by URL and return plain text (HTML converted to text). ` +
      `Use when the user sends a link (http/https) or asks to open/read a specific URL. ` +
      `Does NOT require Google login.`,
    {
      url: z.string().describe('Full http:// or https:// URL to fetch'),
      prompt: z
        .string()
        .optional()
        .describe('Optional hint about what to extract (for your own reasoning; returned as context header)'),
    },
    async ({ url, prompt }) => {
      const trimmed = url?.trim() || extractUrlFromText(prompt || '') || '';
      if (!trimmed) {
        return {
          content: [{ type: 'text' as const, text: "Error: 'url' is required (http:// or https://)." }],
          isError: true,
        };
      }
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return {
          content: [{ type: 'text' as const, text: "Error: url must start with http:// or https://." }],
          isError: true,
        };
      }

      try {
        const { url: resolvedUrl, text } = await fetchUrlAsPlainText(trimmed);
        const header = prompt
          ? `Fetched ${resolvedUrl}\nUser focus: ${prompt}\n\n---\n\n`
          : `Fetched ${resolvedUrl}\n\n---\n\n`;
        return {
          content: [{ type: 'text' as const, text: header + text }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching ${trimmed}: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'one_web_search',
    `Search the public web without Google account login. Default engine: Baidu (百度). ` +
      `Use when the user asks to search the web, 百度搜索, 搜一下, or needs fresh information from the internet.`,
    {
      query: z.string().describe('Search keywords or question'),
      engine: z
        .enum(SEARCH_ENGINES)
        .optional()
        .describe('Search engine: baidu (default), bing, or duckduckgo'),
    },
    async ({ query, engine }) => {
      const trimmed = query?.trim() || '';
      if (!trimmed) {
        return {
          content: [{ type: 'text' as const, text: "Error: 'query' is required." }],
          isError: true,
        };
      }

      try {
        const parsedEngine = parseEngine(engine);
        const { engine: resolvedEngine, query: resolvedQuery, searchUrl, text, resultLinks } =
          await fetchSearchResultsAsPlainText(trimmed, parsedEngine);
        const sourcesBlock = formatSourcesBlock(searchUrl, resultLinks);
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Web search (${resolvedEngine}) for: ${resolvedQuery}\n` +
                `${sourcesBlock}\n\n---\n\n${text}`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error performing web search: ${message}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[WebToolsMCP] Fatal error:', error);
  process.exit(1);
});
