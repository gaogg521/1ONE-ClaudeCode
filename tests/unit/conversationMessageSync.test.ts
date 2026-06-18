/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { emitter } from '@/renderer/utils/emitter';
import {
  clearScheduledConversationMessageSync,
  CONVERSATION_MESSAGE_SYNC_DEBOUNCE_MS,
  scheduleConversationMessageSync,
} from '@/renderer/pages/conversation/Messages/conversationMessageSync';

describe('conversationMessageSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces conversation.messages.sync emissions', () => {
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const emitSpy = vi.spyOn(emitter, 'emit');

    scheduleConversationMessageSync('conv-1', timerRef);
    scheduleConversationMessageSync('conv-1', timerRef);

    expect(emitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CONVERSATION_MESSAGE_SYNC_DEBOUNCE_MS);

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('conversation.messages.sync', { conversationId: 'conv-1' });
  });

  it('clearScheduledConversationMessageSync cancels pending sync', () => {
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const emitSpy = vi.spyOn(emitter, 'emit');

    scheduleConversationMessageSync('conv-1', timerRef);
    clearScheduledConversationMessageSync(timerRef);
    vi.advanceTimersByTime(CONVERSATION_MESSAGE_SYNC_DEBOUNCE_MS);

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
