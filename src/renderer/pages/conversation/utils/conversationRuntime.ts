/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type {
  TChatConversationStatus,
  TConversationRuntimeStateKind,
  TConversationRuntimeSummary,
} from '@/common/config/storage';

export function runtimeSummaryFromTurnCompletedEvent(
  event: IConversationTurnCompletedEvent,
  turn_id?: string | null
): TConversationRuntimeSummary {
  const runtime = event.runtime;
  const pendingConfirmations = runtime.pendingConfirmations;
  const isProcessing = runtime.isProcessing;

  let state: TConversationRuntimeStateKind = 'idle';
  if (isProcessing) {
    if (pendingConfirmations > 0) {
      state = 'waiting_confirmation';
    } else if (event.state === 'stopped') {
      state = 'cancelling';
    } else {
      state = 'running';
    }
  } else if (pendingConfirmations > 0 || event.state === 'ai_waiting_confirmation') {
    state = 'waiting_confirmation';
  } else if (event.status === 'pending') {
    state = 'starting';
  } else if (event.state === 'stopped') {
    state = 'cancelling';
  }

  return {
    state,
    can_send_message: event.canSendMessage,
    has_task: runtime.hasTask,
    task_status: runtime.taskStatus,
    is_processing: isProcessing,
    pending_confirmations: pendingConfirmations,
    turn_id: turn_id ?? event.turnId ?? null,
  };
}

export function runtimeSummaryFromConversationStatus(
  status?: TChatConversationStatus,
  pendingConfirmations = 0
): TConversationRuntimeSummary {
  const isProcessing = status === 'running' || status === 'pending';
  const hasPendingConfirmations = pendingConfirmations > 0;

  return {
    state: hasPendingConfirmations ? 'waiting_confirmation' : isProcessing ? 'running' : 'idle',
    can_send_message: !isProcessing && !hasPendingConfirmations,
    has_task: isProcessing,
    task_status: status,
    is_processing: isProcessing,
    pending_confirmations: pendingConfirmations,
    turn_id: null,
  };
}

export function runtimeSummaryForActiveSend(turn_id: string): TConversationRuntimeSummary {
  return {
    state: 'running',
    can_send_message: false,
    has_task: true,
    task_status: 'running',
    is_processing: true,
    pending_confirmations: 0,
    turn_id,
  };
}
