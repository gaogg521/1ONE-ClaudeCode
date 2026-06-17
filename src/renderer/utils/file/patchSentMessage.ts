/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { buildDisplayMessage, stripFilesMarker } from '@/common/chat/messageFiles';

export type SendMessageResult = {
  data?: {
    input?: string;
    files?: string[];
  };
};

type AddOrUpdateMessage = (message: TMessage, replace?: boolean) => void;

/** Resolve the user-visible message body after sendMessage copies attachments into workspace. */
export function resolveSentDisplayContent(result: SendMessageResult, fallbackContent: string): string {
  if (result.data?.input) {
    return result.data.input;
  }
  if (result.data?.files?.length) {
    return buildDisplayMessage(stripFilesMarker(fallbackContent), result.data.files, '');
  }
  return fallbackContent;
}

/** Sync optimistic user message content with server-resolved file paths after sendMessage. */
export function patchSentMessageContent(
  addOrUpdateMessage: AddOrUpdateMessage,
  conversationId: string,
  msgId: string,
  result: SendMessageResult,
  fallbackContent = ''
): void {
  const resolvedInput = resolveSentDisplayContent(result, fallbackContent);
  addOrUpdateMessage(
    {
      id: msgId,
      msg_id: msgId,
      type: 'text',
      position: 'right',
      conversation_id: conversationId,
      content: { content: resolvedInput },
      status: 'finish',
      createdAt: Date.now(),
    },
    false
  );
}

/**
 * Show the user message after sendMessage succeeds.
 * Attachments defer bubble rendering until workspace paths are known (temp cache paths are deleted after copy).
 */
export function showUserMessageAfterSend(
  addOrUpdateMessage: AddOrUpdateMessage,
  conversationId: string,
  msgId: string,
  result: SendMessageResult,
  fallbackContent: string,
  options: { showedOptimistic: boolean }
): void {
  const resolvedInput = resolveSentDisplayContent(result, fallbackContent);
  addOrUpdateMessage(
    {
      id: msgId,
      msg_id: msgId,
      type: 'text',
      position: 'right',
      conversation_id: conversationId,
      content: { content: resolvedInput },
      status: 'finish',
      createdAt: Date.now(),
    },
    !options.showedOptimistic
  );
}
