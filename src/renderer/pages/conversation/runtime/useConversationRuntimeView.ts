/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import {
  runtimeSummaryFromConversationStatus,
  runtimeSummaryFromTurnCompletedEvent,
} from '@/renderer/pages/conversation/utils/conversationRuntime';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  conversationDeleted,
  getConversationRuntimeViewSnapshot,
  hydrateFailed,
  hydrateStarted,
  hydrateSucceeded,
  localSendAccepted,
  localSendFailed,
  localSendStarted,
  localStopAcknowledged,
  localStopRequested,
  resetLocalGate,
  subscribeConversationRuntimeView,
  turnCompleted,
  type ConversationRuntimeView,
  type ConversationRuntimeViewLogEntry,
} from './conversationRuntimeViewStore';

type UseConversationRuntimeViewReturn = {
  view: ConversationRuntimeView;
  hydrated: boolean;
  state: ConversationRuntimeView['state'];
  isProcessing: boolean;
  canSendMessage: boolean;
  activeTurnId: string | null;
  markSendStarted: () => void;
  markSendAccepted: (turn_id: string, runtime: TConversationRuntimeSummary, msg_id?: string) => void;
  markSendFailed: (reason: string) => void;
  markStopRequested: (turn_id: string) => void;
  markStopAcknowledged: (turn_id: string, runtime: TConversationRuntimeSummary) => void;
  resetLocalGate: (reason: string) => void;
};

const normalizeReason = (reason: string): string => reason.trim().slice(0, 200) || 'unknown';

const getRuntimeOrNull = (runtime: TConversationRuntimeSummary | undefined): TConversationRuntimeSummary | null =>
  runtime ?? null;

export const useConversationRuntimeView = (conversation_id: string): UseConversationRuntimeViewReturn => {
  const getSnapshot = useCallback(() => getConversationRuntimeViewSnapshot(conversation_id), [conversation_id]);
  const view = useSyncExternalStore(subscribeConversationRuntimeView, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!conversation_id) {
      return;
    }

    let cancelled = false;
    hydrateStarted(conversation_id);

    void getConversationOrNull(conversation_id)
      .then((conversation) => {
        if (cancelled) {
          return;
        }
        const runtime =
          getRuntimeOrNull(conversation?.runtime) ??
          runtimeSummaryFromConversationStatus(conversation?.status, conversation?.runtime?.pending_confirmations);
        hydrateSucceeded(conversation_id, runtime);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        hydrateFailed(conversation_id, normalizeReason(reason));
      });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  useEffect(() => {
    if (!conversation_id) {
      return;
    }

    const disposeTurnCompleted = ipcBridge.conversation.turnCompleted.on((event) => {
      if (event.sessionId !== conversation_id) {
        return;
      }
      const runtime = runtimeSummaryFromTurnCompletedEvent(event);
      turnCompleted(conversation_id, runtime.turn_id ?? event.turnId ?? null, runtime);
    });

    const disposeListChanged = ipcBridge.conversation.listChanged.on((event) => {
      if (event.conversationId !== conversation_id || event.action !== 'deleted') {
        return;
      }
      conversationDeleted(conversation_id);
    });

    return () => {
      disposeTurnCompleted();
      disposeListChanged();
    };
  }, [conversation_id]);

  const markSendStarted = useCallback(() => {
    localSendStarted(conversation_id);
  }, [conversation_id]);

  const markSendAccepted = useCallback(
    (turn_id: string, runtime: TConversationRuntimeSummary, msg_id?: string) => {
      localSendAccepted(conversation_id, turn_id, runtime, msg_id);
    },
    [conversation_id]
  );

  const markSendFailed = useCallback(
    (reason: string) => {
      localSendFailed(conversation_id, normalizeReason(reason));
    },
    [conversation_id]
  );

  const markStopRequested = useCallback(
    (turn_id: string) => {
      localStopRequested(conversation_id, turn_id);
    },
    [conversation_id]
  );

  const markStopAcknowledged = useCallback(
    (turn_id: string, runtime: TConversationRuntimeSummary) => {
      localStopAcknowledged(conversation_id, turn_id, runtime);
    },
    [conversation_id]
  );

  const resetLocalRuntimeGate = useCallback(
    (reason: string) => {
      resetLocalGate(conversation_id, normalizeReason(reason));
    },
    [conversation_id]
  );

  return {
    view,
    hydrated: view.hydrated,
    state: view.state,
    isProcessing: view.isProcessing,
    canSendMessage: view.canSendMessage,
    activeTurnId: view.activeTurnId,
    markSendStarted,
    markSendAccepted,
    markSendFailed,
    markStopRequested,
    markStopAcknowledged,
    resetLocalGate: resetLocalRuntimeGate,
  };
};

export const logStreamTerminalObserved = (
  _conversation_id: string,
  _turn_id: string | undefined,
  _platform: 'acp' | 'aionrs',
  _stream_type: string
): void => {
  // Optional renderer logging hook — no-op when writeRendererLog bridge is unavailable.
};

export type { ConversationRuntimeViewLogEntry };
