import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  enrichAutopilotPrompt,
  extractLastAssistantReply,
} from '@process/services/cron/autopilotPostback';

describe('autopilotPostback', () => {
  it('extractLastAssistantReply returns the newest left-side text message', () => {
    const messages: TMessage[] = [
      {
        id: '3',
        msg_id: '3',
        type: 'text',
        position: 'left',
        conversation_id: 'conv-1',
        content: { content: 'latest reply' },
        createdAt: 3,
      },
      {
        id: '2',
        msg_id: '2',
        type: 'text',
        position: 'left',
        conversation_id: 'conv-1',
        content: { content: 'older reply' },
        createdAt: 2,
      },
      {
        id: '1',
        msg_id: '1',
        type: 'text',
        position: 'right',
        conversation_id: 'conv-1',
        content: { content: 'user prompt' },
        createdAt: 1,
      },
    ];

    expect(extractLastAssistantReply(messages)).toBe('latest reply');
  });

  it('enrichAutopilotPrompt appends skill and postback instructions', () => {
    const prompt = enrichAutopilotPrompt('Scan open issues', {
      source: 'super_assistant',
      skillNames: ['delivery-metrics'],
      postBackToIssue: true,
      requirementId: 'story-1',
    });

    expect(prompt).toContain('Scan open issues');
    expect(prompt).toContain('delivery-metrics');
    expect(prompt).toContain('[Issue Postback]');
  });
});
