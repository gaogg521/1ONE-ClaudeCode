/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildConversationTurnCompletedEvent,
  emitAgentTurnCompleted,
} from '@process/utils/emitConversationTurnCompleted';
import { runtimeSummaryFromTurnCompletedEvent } from '@/renderer/pages/conversation/utils/conversationRuntime';

describe('buildConversationTurnCompletedEvent', () => {
  it('forces processing flag when explicit state is ai_generating', () => {
    const event = buildConversationTurnCompletedEvent({
      sessionId: 'conv-1',
      turnId: 'turn-abc',
      status: 'finished',
      pendingConfirmations: 0,
      workspace: '/tmp',
      model: { platform: 'openai', name: 'OpenAI', useModel: 'gpt-4.1' },
      state: 'ai_generating',
    });

    expect(event.runtime.isProcessing).toBe(true);
    expect(event.canSendMessage).toBe(false);
  });

  it('includes turn id and blocks send while pending confirmations exist', () => {
    const event = buildConversationTurnCompletedEvent({
      sessionId: 'conv-1',
      turnId: 'turn-abc',
      status: 'finished',
      pendingConfirmations: 1,
      workspace: '/tmp',
      model: { platform: 'openai', name: 'OpenAI', useModel: 'gpt-4.1' },
      state: 'ai_waiting_confirmation',
    });

    expect(event.turnId).toBe('turn-abc');
    expect(event.canSendMessage).toBe(false);
    expect(event.runtime.pendingConfirmations).toBe(1);
  });

  it('maps waiting confirmation state even when task status is finished', () => {
    const event = buildConversationTurnCompletedEvent({
      sessionId: 'conv-1',
      turnId: 'turn-abc',
      status: 'finished',
      pendingConfirmations: 1,
      workspace: '/tmp',
      model: { platform: 'openai', name: 'OpenAI', useModel: 'gpt-4.1' },
      state: 'ai_waiting_confirmation',
    });

    const summary = runtimeSummaryFromTurnCompletedEvent(event);
    expect(summary.state).toBe('waiting_confirmation');
    expect(summary.can_send_message).toBe(false);
    expect(summary.turn_id).toBe('turn-abc');
  });
});

describe('emitAgentTurnCompleted', () => {
  it('builds model metadata from modelId when full model config is unavailable', () => {
    const event = buildConversationTurnCompletedEvent({
      sessionId: 'conv-acp',
      turnId: 'turn-1',
      status: 'running',
      pendingConfirmations: 0,
      workspace: '/tmp',
      model: { platform: 'claude', name: 'claude', useModel: 'claude-sonnet' },
      state: 'ai_generating',
    });

    expect(event.model.useModel).toBe('claude-sonnet');
    expect(event.canSendMessage).toBe(false);

    emitAgentTurnCompleted(
      {
        conversation_id: 'conv-acp',
        workspace: '/tmp',
        status: 'running',
        getConfirmations: () => [],
        modelPlatform: 'claude',
        modelId: 'claude-sonnet',
      },
      'turn-1',
      'ai_generating'
    );
  });
});
