import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import { collectWebSourcesFromToolMessages } from '@/renderer/utils/web/collectWebSourcesFromTools';

describe('collectWebSourcesFromToolMessages', () => {
  it('extracts URL from successful WebFetch tool_group item', () => {
    const message: IMessageToolGroup = {
      id: '1',
      msg_id: 'm1',
      conversation_id: 'c1',
      createdAt: 0,
      position: 'left',
      type: 'tool_group',
      content: [
        {
          callId: 'call-1',
          name: 'WebFetch',
          description: 'Fetching https://api.luanti.org/',
          status: 'Success',
          args: { url: 'https://api.luanti.org/', prompt: 'summarize' },
          resultDisplay:
            'Content from https://api.luanti.org/ processed successfully.\nSources: https://api.luanti.org/',
        },
      ],
    };

    const sources = collectWebSourcesFromToolMessages([message]);
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources[0]?.url).toBe('https://api.luanti.org/');
  });

  it('extracts search URL from WebSearch tool_group item', () => {
    const message: IMessageToolGroup = {
      id: '2',
      msg_id: 'm2',
      conversation_id: 'c1',
      createdAt: 0,
      position: 'left',
      type: 'tool_group',
      content: [
        {
          callId: 'call-2',
          name: 'WebSearch',
          description: 'Searching the web',
          status: 'Success',
          args: { query: '中国四大淡水湖', engine: 'baidu' },
          resultDisplay:
            'Web search (baidu) completed for: 中国四大淡水湖\nhttps://www.baidu.com/s?wd=%E4%B8%AD%E5%9B%BD',
        },
      ],
    };

    const sources = collectWebSourcesFromToolMessages([message]);
    expect(sources.some((s) => s.url.includes('baidu.com/s'))).toBe(true);
  });

  it('extracts URLs from completed ACP one_web_fetch MCP tool', () => {
    const message: IMessageAcpToolCall = {
      id: '3',
      msg_id: 'tc1',
      conversation_id: 'c1',
      createdAt: 0,
      position: 'left',
      type: 'acp_tool_call',
      content: {
        update: {
          toolCallId: 'tc1',
          title: 'one_web_fetch',
          kind: 'fetch',
          status: 'completed',
          rawInput: { url: 'https://example.com/docs' },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Fetched https://example.com/docs\n---\nPage body',
              },
            },
          ],
        },
      },
    };

    const sources = collectWebSourcesFromToolMessages([message]);
    expect(sources[0]?.url).toBe('https://example.com/docs');
  });
});
