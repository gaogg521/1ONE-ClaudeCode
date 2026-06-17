/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';

/** Merge DB snapshot with in-flight streaming messages (initial load / mid-stream). */
export function mergeDbMessagesWithStreaming(key: string, messages: TMessage[], currentList: TMessage[]): TMessage[] {
  if (!currentList.length) return messages;
  const sameConversation = currentList.filter((m) => m.conversation_id === key);
  if (!sameConversation.length) return messages;
  const dbIds = new Set(messages.map((m) => m.id));
  const dbMsgIds = new Set(messages.map((m) => m.msg_id).filter(Boolean));

  const streamingByMsgId = new Map<string, TMessage>();
  for (const m of sameConversation) {
    if (m.msg_id && m.type === 'text' && dbMsgIds.has(m.msg_id)) {
      streamingByMsgId.set(m.msg_id, m);
    }
  }

  const mergedMessages = messages.map((dbMsg) => {
    if (!dbMsg.msg_id || dbMsg.type !== 'text') return dbMsg;
    const streamMsg = streamingByMsgId.get(dbMsg.msg_id);
    if (!streamMsg) return dbMsg;
    const dbContent =
      typeof dbMsg.content === 'object' && 'content' in dbMsg.content
        ? String((dbMsg.content as { content: unknown }).content)
        : '';
    const streamContent =
      typeof streamMsg.content === 'object' && 'content' in streamMsg.content
        ? String((streamMsg.content as { content: unknown }).content)
        : '';
    return streamContent.length > dbContent.length ? streamMsg : dbMsg;
  });

  const streamingOnly = sameConversation.filter((m) => !dbIds.has(m.id) && !(m.msg_id && dbMsgIds.has(m.msg_id)));
  if (!streamingOnly.length && !streamingByMsgId.size) return messages;
  return [...mergedMessages, ...streamingOnly];
}

/** After turn finish, DB is authoritative (avoids stale batched stream chunks). */
export function replaceMessageListFromDb(messages: TMessage[]): TMessage[] {
  return messages;
}
