/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { buildDisplayMessage } from '@/common/chat/messageFiles';
import {
  resolveSentDisplayContent,
  showUserMessageAfterSend,
  type SendMessageResult,
} from '@/renderer/utils/file/patchSentMessage';

export type { SendMessageResult };

type AddOrUpdateMessage = (message: TMessage, replace?: boolean) => void;

export type PreparedUserMessageSend = {
  hasAttachments: boolean;
  displayMessage: string;
  optimisticMessage: TMessage;
};

/** Build display payload and optimistic bubble before sendMessage. */
export function prepareUserMessageSend(
  input: string,
  files: string[],
  workspace: string,
  msgId: string,
  conversationId: string
): PreparedUserMessageSend {
  const hasAttachments = files.length > 0;
  const displayMessage = buildDisplayMessage(input, files, workspace);
  const optimisticMessage: TMessage = {
    id: msgId,
    msg_id: msgId,
    type: 'text',
    position: 'right',
    conversation_id: conversationId,
    content: { content: input },
    ...(hasAttachments ? { status: 'pending' as const } : {}),
    createdAt: Date.now(),
  };
  return { hasAttachments, displayMessage, optimisticMessage };
}

export function publishOptimisticUserMessage(
  addOrUpdateMessage: AddOrUpdateMessage,
  optimisticMessage: TMessage | null
): void {
  if (optimisticMessage) {
    addOrUpdateMessage(optimisticMessage, true);
  }
}

export function finalizeUserMessageAfterSend(
  addOrUpdateMessage: AddOrUpdateMessage,
  conversationId: string,
  msgId: string,
  result: SendMessageResult,
  fallbackContent: string,
  prepared: Pick<PreparedUserMessageSend, 'optimisticMessage'>
): void {
  showUserMessageAfterSend(addOrUpdateMessage, conversationId, msgId, result, fallbackContent, {
    showedOptimistic: Boolean(prepared.optimisticMessage),
  });
}

export { resolveSentDisplayContent, showUserMessageAfterSend };
