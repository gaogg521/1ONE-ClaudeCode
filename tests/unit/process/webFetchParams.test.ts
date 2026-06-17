import { describe, expect, it } from 'vitest';
import { isWebFetchToolName, normalizeWebFetchToolParams } from '@/process/agent/gemini/cli/tools/web-fetch-params';
import { extractTextFromAgentQuery, normalizeToolParams } from '@/process/agent/gemini/utils';

describe('normalizeWebFetchToolParams', () => {
  it('maps link and instruction aliases to url and prompt', () => {
    const result = normalizeWebFetchToolParams({
      link: 'https://example.com/page',
      instruction: 'Summarize the table',
    });
    expect(result).toEqual({
      url: 'https://example.com/page',
      prompt: 'Summarize the table',
    });
  });

  it('unwraps nested input object', () => {
    const result = normalizeWebFetchToolParams({
      input: {
        href: 'https://example.com/nested',
        task: 'List items',
      },
    });
    expect(result.url).toBe('https://example.com/nested');
    expect(result.prompt).toBe('List items');
  });

  it('extracts url from prompt text when url field is missing', () => {
    const result = normalizeWebFetchToolParams({
      prompt: 'Please read https://slaythespire2.gg/zh/ancients and make a table',
    });
    expect(result.url).toBe('https://slaythespire2.gg/zh/ancients');
    expect(result.prompt).toContain('slaythespire2.gg');
  });

  it('uses fallbackText when tool args are empty', () => {
    const result = normalizeWebFetchToolParams(
      {},
      {
        fallbackText: 'https://slaythespire2.gg/zh/ancients\n把这个页面里的先古选项整理成表格',
      }
    );
    expect(result.url).toBe('https://slaythespire2.gg/zh/ancients');
    expect(typeof result.prompt).toBe('string');
    expect((result.prompt as string).length).toBeGreaterThan(0);
  });

  it('defaults prompt when only url is provided', () => {
    const result = normalizeWebFetchToolParams({ url: 'https://example.com' });
    expect(result.url).toBe('https://example.com');
    expect(result.prompt).toMatch(/extract/i);
  });
});

describe('normalizeToolParams integration', () => {
  it('recognizes web fetch tool names', () => {
    expect(isWebFetchToolName('1one_web_fetch')).toBe(true);
    expect(isWebFetchToolName('web_fetch')).toBe(true);
    expect(isWebFetchToolName('WebFetch')).toBe(true);
    expect(isWebFetchToolName('read_file')).toBe(false);
  });

  it('routes web fetch tools through web fetch normalization', () => {
    const result = normalizeToolParams('1one_web_fetch', { href: 'https://a.test' }, {});
    expect(result.url).toBe('https://a.test');
  });
});

describe('extractTextFromAgentQuery', () => {
  it('reads string and multipart queries', () => {
    expect(extractTextFromAgentQuery('hello https://x.test')).toBe('hello https://x.test');
    expect(extractTextFromAgentQuery([{ text: 'line with https://y.test' }])).toBe('line with https://y.test');
  });
});
