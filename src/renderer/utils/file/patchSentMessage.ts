/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';

type SendMessageResult = {
  data?: {
    input?: string;
    files?: string[];
  };
};

type AddOrUpdateMessage = (message: TMessage, replace?: boolean) => void;

/** Sync optimistic user message content with server-resolved file paths after sendMessage. */
export function patchSentMessageContent(
  addOrUpdateMessage: AddOrUpdateMessage,
  conversationId: string,
  msgId: string,
  result: SendMessageResult
): void {
  const resolvedInput = result.data?.input;
  if (!resolvedInput) {
    return;
  }
  addOrUpdateMessage(
    {
      id: msgId,
      type: 'text',
      position: 'right',
      conversation_id: conversationId,
      content: { content: resolvedInput },
      createdAt: Date.now(),
    },
    true
  );
}
