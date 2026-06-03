import { describe, expect, it } from 'vitest';
import {
  buildSearchEngineUrl,
  detectSearchEngineFromQuery,
  normalizeOneWebSearchToolParams,
} from '@/process/agent/gemini/cli/tools/one-web-search';

describe('search-engine-url', () => {
  it('builds Baidu search URL', () => {
    const url = buildSearchEngineUrl('baidu', '杀戮尖塔 先古');
    expect(url.startsWith('https://www.baidu.com/s?wd=')).toBe(true);
    expect(decodeURIComponent(url.replace('https://www.baidu.com/s?wd=', ''))).toBe('杀戮尖塔 先古');
  });

  it('strips 百度搜索 prefix and keeps baidu engine', () => {
    const { engine, query } = detectSearchEngineFromQuery('百度搜索 杀戮尖塔攻略');
    expect(engine).toBe('baidu');
    expect(query).toBe('杀戮尖塔攻略');
  });
});

describe('normalizeOneWebSearchToolParams', () => {
  it('maps keyword alias to query', () => {
    const result = normalizeOneWebSearchToolParams({ keyword: '天气 北京' });
    expect(result.query).toBe('天气 北京');
    expect(result.engine).toBe('baidu');
  });

  it('uses fallbackText when args are empty', () => {
    const result = normalizeOneWebSearchToolParams(
      {},
      { fallbackText: '百度搜索 最新 AI 新闻' }
    );
    expect(result.query).toBe('最新 AI 新闻');
    expect(result.engine).toBe('baidu');
  });

  it('does not treat bare URL fallback as search query', () => {
    const result = normalizeOneWebSearchToolParams(
      {},
      { fallbackText: 'https://example.com/page' }
    );
    expect(result.query).toBeUndefined();
  });
});
