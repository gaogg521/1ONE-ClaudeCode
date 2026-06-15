import { describe, expect, it, vi, beforeEach } from 'vitest';
import { prefetchWebContextForUserMessage, shouldPrefetchWebContext } from '@/common/web/prefetchWebContext';

vi.mock('@/common/web/pageTools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/web/pageTools')>();
  return {
    ...actual,
    fetchUrlAsPlainText: vi.fn(async (url: string) => ({
      url,
      text: 'Luanti API documentation excerpt',
    })),
    fetchSearchResultsAsPlainText: vi.fn(async (query: string) => ({
      engine: 'baidu' as const,
      query: '四大淡水湖',
      searchUrl: 'https://www.baidu.com/s?wd=test',
      text: 'search snippet',
      resultLinks: ['https://example.com/a'],
    })),
  };
});

describe('prefetchWebContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shouldPrefetch when message contains http URL', () => {
    expect(shouldPrefetchWebContext('https://api.luanti.org/ 总结一下')).toBe(true);
    expect(shouldPrefetchWebContext('hello')).toBe(false);
  });

  it('shouldPrefetch for explicit search intents without URL', () => {
    expect(shouldPrefetchWebContext('百度搜索 四大淡水湖')).toBe(true);
  });

  it('prefetches URL content block for ACP prompt injection', async () => {
    const result = await prefetchWebContextForUserMessage('https://api.luanti.org/ 阅读这个URL，总结一下');
    expect(result?.kind).toBe('fetch');
    if (result?.kind === 'fetch') {
      expect(result.url).toBe('https://api.luanti.org/');
      expect(result.block).toContain('<1one-web-context>');
      expect(result.block).toContain('Luanti API');
    }
  });

  it('prefetches search block for 百度搜索', async () => {
    const result = await prefetchWebContextForUserMessage('百度搜索 四大淡水湖');
    expect(result?.kind).toBe('search');
    if (result?.kind === 'search') {
      expect(result.block).toContain('Sources:');
      expect(result.block).toContain('search snippet');
    }
  });
});
