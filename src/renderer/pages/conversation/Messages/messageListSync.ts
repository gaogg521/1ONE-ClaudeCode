/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';

/** Text messages in a turn share msg_id; disambiguate by speaker position. */
export function textMessageStreamKey(message: TMessage): string | null {
  if (message.type !== 'text' || !message.msg_id) return null;
  return `${message.msg_id}:${message.position ?? 'left'}`;
}

/** Merge DB snapshot with in-flight streaming messages (initial load / mid-stream). */
export function mergeDbMessagesWithStreaming(key: string, messages: TMessage[], currentList: TMessage[]): TMessage[] {
  if (!currentList.length) return messages;
  const sameConversation = currentList.filter((m) => m.conversation_id === key);
  if (!sameConversation.length) return messages;
  const dbIds = new Set(messages.map((m) => m.id));
  const dbStreamKeys = new Set(
    messages.map((m) => textMessageStreamKey(m)).filter((key): key is string => Boolean(key))
  );

  const streamingByKey = new Map<string, TMessage>();
  const streamingThinkingByMsgId = new Map<string, TMessage>();
  for (const m of sameConversation) {
    const streamKey = textMessageStreamKey(m);
    if (streamKey && dbStreamKeys.has(streamKey)) {
      streamingByKey.set(streamKey, m);
    }
    if (m.type === 'thinking' && m.msg_id) {
      streamingThinkingByMsgId.set(m.msg_id, m);
    }
  }

  const mergedMessages = messages.map((dbMsg) => {
    if (dbMsg.type === 'thinking' && dbMsg.msg_id) {
      const streamMsg = streamingThinkingByMsgId.get(dbMsg.msg_id);
      if (streamMsg?.type === 'thinking') {
        const dbLen = thinkingContentLength(dbMsg);
        const streamLen = thinkingContentLength(streamMsg);
        return streamLen > dbLen ? streamMsg : dbMsg;
      }
      return dbMsg;
    }
    const streamKey = textMessageStreamKey(dbMsg);
    if (!streamKey) return dbMsg;
    const streamMsg = streamingByKey.get(streamKey);
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

  const streamingOnly = sameConversation.filter((m) => {
    if (dbIds.has(m.id)) return false;
    const streamKey = textMessageStreamKey(m);
    if (streamKey && dbStreamKeys.has(streamKey)) return false;
    if (m.type === 'thinking' && m.msg_id) {
      return !messages.some((db) => db.type === 'thinking' && db.msg_id === m.msg_id);
    }
    return true;
  });
  if (!streamingOnly.length && !streamingByKey.size && !streamingThinkingByMsgId.size) return messages;
  return [...mergedMessages, ...streamingOnly];
}

/** After turn finish, DB is authoritative (avoids stale batched stream chunks). */
export function replaceMessageListFromDb(messages: TMessage[]): TMessage[] {
  return messages;
}

function textContentLength(message: TMessage): number {
  if (message.type !== 'text' || typeof message.content !== 'object' || !('content' in message.content)) {
    return 0;
  }
  return String((message.content as { content: unknown }).content).length;
}

function thinkingContentLength(message: TMessage): number {
  if (message.type !== 'thinking' || typeof message.content !== 'object' || !('content' in message.content)) {
    return 0;
  }
  return String((message.content as { content: unknown }).content).length;
}

/** Fast fingerprint to skip no-op DB reloads during polling / debounced sync. */
export function messageListSyncSignature(messages: TMessage[]): string {
  if (!messages.length) return '0';
  const last = messages[messages.length - 1];
  const tailLen = last.type === 'thinking' ? thinkingContentLength(last) : textContentLength(last);
  return `${messages.length}:${last.id}:${last.type}:${last.position ?? ''}:${last.msg_id ?? ''}:${tailLen}`;
}

/** True when UI list already matches the DB snapshot (avoid full Virtuoso reset). */
export function messageListsEquivalentForSync(current: TMessage[], next: TMessage[]): boolean {
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i++) {
    const a = current[i];
    const b = next[i];
    if (a.id !== b.id || a.type !== b.type || a.position !== b.position || a.msg_id !== b.msg_id) {
      return false;
    }
    if (a.status !== b.status) return false;
    if (a.type === 'text' && b.type === 'text') {
      const ac =
        typeof a.content === 'object' && 'content' in a.content
          ? String((a.content as { content: unknown }).content)
          : '';
      const bc =
        typeof b.content === 'object' && 'content' in b.content
          ? String((b.content as { content: unknown }).content)
          : '';
      if (ac !== bc) return false;
    }
    if (a.type === 'thinking' && b.type === 'thinking') {
      const ac =
        typeof a.content === 'object' && 'content' in a.content
          ? String((a.content as { content: unknown }).content)
          : '';
      const bc =
        typeof b.content === 'object' && 'content' in b.content
          ? String((b.content as { content: unknown }).content)
          : '';
      if (ac !== bc) return false;
      const aStatus =
        typeof a.content === 'object' && 'status' in a.content ? String((a.content as { status: unknown }).status) : '';
      const bStatus =
        typeof b.content === 'object' && 'status' in b.content ? String((b.content as { status: unknown }).status) : '';
      if (aStatus !== bStatus) return false;
    }
  }
  return true;
}
