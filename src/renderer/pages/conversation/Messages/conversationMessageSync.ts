/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useRef } from 'react';

/** Debounce window for coalescing finish/error/poll sync requests. */
export const CONVERSATION_MESSAGE_SYNC_DEBOUNCE_MS = 200;

type SyncTimerRef = { current: ReturnType<typeof setTimeout> | null };

export function scheduleConversationMessageSync(
  conversationId: string,
  timerRef: SyncTimerRef,
  delayMs = CONVERSATION_MESSAGE_SYNC_DEBOUNCE_MS
): void {
  if (!conversationId) return;
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    emitter.emit('conversation.messages.sync', { conversationId });
  }, delayMs);
}

export function clearScheduledConversationMessageSync(timerRef: SyncTimerRef): void {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

/** Debounced `conversation.messages.sync` emitter for stream finish / DB fallback polling. */
export function useConversationMessageSync(conversationId: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMessageSync = useCallback(() => {
    scheduleConversationMessageSync(conversationId, timerRef);
  }, [conversationId]);

  useEffect(() => {
    return () => clearScheduledConversationMessageSync(timerRef);
  }, []);

  return scheduleMessageSync;
}

/** Fire sync once when `running` transitions true → false (skip initial mount). */
export function useSyncOnRunningComplete(
  conversationId: string,
  running: boolean,
  scheduleMessageSync: () => void
): void {
  const wasRunningRef = useRef(false);

  useEffect(() => {
    wasRunningRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (running) {
      wasRunningRef.current = true;
      return;
    }
    if (!wasRunningRef.current) {
      return;
    }
    wasRunningRef.current = false;
    scheduleMessageSync();
  }, [conversationId, running, scheduleMessageSync]);
}
