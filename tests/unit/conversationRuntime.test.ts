import { describe, expect, it } from 'vitest';
import { normalizeAgentStreamError } from '@/common/chat/chatLib';
import { runtimeSummaryFromTurnCompletedEvent } from '@/renderer/pages/conversation/utils/conversationRuntime';
import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';

describe('normalizeAgentStreamError', () => {
  it('parses structured agent errors', () => {
    const parsed = normalizeAgentStreamError({
      message: 'Provider auth failed',
      code: 'USER_LLM_PROVIDER_AUTH_FAILED',
      ownership: 'user_llm_provider',
      retryable: false,
      resolution: { kind: 'check_provider_credentials' },
    });

    expect(parsed?.code).toBe('USER_LLM_PROVIDER_AUTH_FAILED');
    expect(parsed?.ownership).toBe('user_llm_provider');
    expect(parsed?.resolution?.kind).toBe('check_provider_credentials');
  });
});

describe('runtimeSummaryFromTurnCompletedEvent', () => {
  it('maps busy turn events into runtime summary', () => {
    const event: IConversationTurnCompletedEvent = {
      sessionId: 'conv-1',
      status: 'running',
      state: 'ai_generating',
      detail: '',
      canSendMessage: false,
      runtime: {
        hasTask: true,
        taskStatus: 'running',
        isProcessing: true,
        pendingConfirmations: 0,
      },
      workspace: '/tmp',
      model: { platform: 'openai', name: 'OpenAI', useModel: 'gpt-4.1' },
      lastMessage: { createdAt: Date.now() },
    };

    const summary = runtimeSummaryFromTurnCompletedEvent(event, 'turn-1');
    expect(summary.turn_id).toBe('turn-1');
    expect(summary.is_processing).toBe(true);
    expect(summary.can_send_message).toBe(false);
    expect(summary.state).toBe('running');
  });
});
