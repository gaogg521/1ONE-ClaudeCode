/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDefaultConversationRuntimeView,
  getConversationRuntimeViewSnapshot,
  hydrateSucceededConversationRuntimeView,
  localSendAccepted,
  localSendAcceptedConversationRuntimeView,
  localSendFailedConversationRuntimeView,
  localSendStartedConversationRuntimeView,
  resetConversationRuntimeViewStoreForTest,
  resetLocalGateConversationRuntimeView,
  turnCompleted,
  turnCompletedConversationRuntimeView,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { runtimeSummaryForActiveSend } from '@/renderer/pages/conversation/utils/conversationRuntime';

describe('conversationRuntimeViewStore', () => {
  beforeEach(() => {
    resetConversationRuntimeViewStoreForTest();
  });

  it('hydrates idle runtime from backend summary', () => {
    const snapshot = hydrateSucceededConversationRuntimeView(undefined, 'conv-1', {
      state: 'idle',
      can_send_message: true,
      has_task: false,
      is_processing: false,
      pending_confirmations: 0,
      turn_id: null,
    });

    expect(snapshot.view.hydrated).toBe(true);
    expect(snapshot.view.canSendMessage).toBe(true);
    expect(snapshot.view.isProcessing).toBe(false);
  });

  it('locks send while local submit is pending', () => {
    const started = localSendStartedConversationRuntimeView(undefined, 'conv-1');
    expect(started.view.localSubmitting).toBe(true);
    expect(started.view.canSendMessage).toBe(false);
    expect(started.view.state).toBe('starting');
  });

  it('applies active send runtime after bridge accepts message', () => {
    const accepted = localSendAcceptedConversationRuntimeView(
      undefined,
      'conv-1',
      'turn-1',
      runtimeSummaryForActiveSend('turn-1')
    );

    expect(accepted.view.activeTurnId).toBe('turn-1');
    expect(accepted.view.isProcessing).toBe(true);
    expect(accepted.view.canSendMessage).toBe(false);
  });

  it('releases send gate when turn completes', () => {
    const completed = turnCompletedConversationRuntimeView(undefined, 'conv-1', 'turn-1', {
      state: 'idle',
      can_send_message: true,
      has_task: false,
      is_processing: false,
      pending_confirmations: 0,
      turn_id: 'turn-1',
    });

    expect(completed.view.canSendMessage).toBe(true);
    expect(completed.view.localSubmitting).toBe(false);
  });

  it('restores send gate after local send failure', () => {
    const failed = localSendFailedConversationRuntimeView(undefined, 'conv-1', 'network error');
    expect(failed.view.canSendMessage).toBe(true);
    expect(failed.view.localSubmitting).toBe(false);
    expect(failed.logs[0]?.data.reason).toBe('network error');
  });

  it('keeps send gate closed while waiting for tool confirmation', () => {
    const waiting = turnCompletedConversationRuntimeView(undefined, 'conv-1', 'turn-1', {
      state: 'waiting_confirmation',
      can_send_message: false,
      has_task: false,
      is_processing: false,
      pending_confirmations: 1,
      turn_id: 'turn-1',
    });

    expect(waiting.view.canSendMessage).toBe(false);
    expect(waiting.view.state).toBe('waiting_confirmation');
  });

  it('allows send-accepted updates while the same turn is still in flight', () => {
    turnCompleted('conv-1', 'turn-new', {
      state: 'running',
      can_send_message: false,
      has_task: true,
      is_processing: true,
      pending_confirmations: 0,
      turn_id: 'turn-new',
    });

    localSendAccepted('conv-1', 'turn-new', runtimeSummaryForActiveSend('turn-new'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.activeTurnId).toBe('turn-new');
    expect(view.isProcessing).toBe(true);
    expect(view.canSendMessage).toBe(false);
  });

  it('ignores stale send-accepted updates after a turn has already finished', () => {
    turnCompleted('conv-1', 'turn-1', {
      state: 'idle',
      can_send_message: true,
      has_task: false,
      is_processing: false,
      pending_confirmations: 0,
      turn_id: 'turn-1',
    });

    localSendAccepted('conv-1', 'turn-1', runtimeSummaryForActiveSend('turn-1'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.canSendMessage).toBe(true);
    expect(view.isProcessing).toBe(false);
  });

  it('clears local gate flags on reset', () => {
    const base = createDefaultConversationRuntimeView('conv-1');
    const reset = resetLocalGateConversationRuntimeView(
      { ...base, localSubmitting: true, localStopping: true },
      'conv-1',
      'stream_timeout'
    );

    expect(reset.view.localSubmitting).toBe(false);
    expect(reset.view.localStopping).toBe(false);
  });
});
