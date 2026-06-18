/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { composeMessage } from '@/common/chat/chatLib';
import { useCallback, useEffect, useRef } from 'react';
import { addEventListener } from '@/renderer/utils/emitter';
import { createContext } from '@renderer/utils/ui/createContext';
import {
  mergeDbMessagesWithStreaming,
  messageListsEquivalentForSync,
  replaceMessageListFromDb,
  textMessageStreamKey,
} from '@renderer/pages/conversation/Messages/messageListSync';

const [useMessageList, MessageListProvider, useUpdateMessageList] = createContext([] as TMessage[]);

const [useChatKey, ChatKeyProvider] = createContext('');

const beforeUpdateMessageListStack: Array<(list: TMessage[]) => TMessage[]> = [];

/** Clears batched stream updates so a DB sync can replace the list without stale chunks winning. */
let cancelPendingMessageUpdatesImpl: (() => void) | null = null;

export function cancelPendingMessageUpdates(): void {
  cancelPendingMessageUpdatesImpl?.();
}

// 消息索引缓存类型定义
// Message index cache type definitions
interface MessageIndex {
  msgIdIndex: Map<string, number>; // msg_id -> index
  callIdIndex: Map<string, number>; // tool_call.callId -> index
  toolCallIdIndex: Map<string, number>; // codex_tool_call.toolCallId / acp_tool_call.toolCallId -> index
}

// 使用 WeakMap 缓存索引，当列表被 GC 时自动清理
// Use WeakMap to cache index, auto-cleanup when list is GC'd
const indexCache = new WeakMap<TMessage[], MessageIndex>();

// 构建消息索引
// Build message index
function buildMessageIndex(list: TMessage[]): MessageIndex {
  const msgIdIndex = new Map<string, number>();
  const callIdIndex = new Map<string, number>();
  const toolCallIdIndex = new Map<string, number>();

  for (let i = 0; i < list.length; i++) {
    const msg = list[i];
    const streamKey = textMessageStreamKey(msg);
    if (streamKey) {
      msgIdIndex.set(streamKey, i);
    } else if (msg.msg_id) {
      msgIdIndex.set(msg.msg_id, i);
    } else if (msg.type === 'text' && msg.position === 'right' && msg.id) {
      msgIdIndex.set(msg.id, i);
    }
    if (msg.type === 'tool_call' && msg.content?.callId) {
      callIdIndex.set(msg.content.callId, i);
    }
    if (msg.type === 'codex_tool_call' && msg.content?.toolCallId) {
      toolCallIdIndex.set(msg.content.toolCallId, i);
    }
    if (msg.type === 'acp_tool_call' && msg.content?.update?.toolCallId) {
      toolCallIdIndex.set(msg.content.update.toolCallId, i);
    }
  }

  return { msgIdIndex, callIdIndex, toolCallIdIndex };
}

// 获取或构建索引（带缓存）
// Get or build index with caching
function getOrBuildIndex(list: TMessage[]): MessageIndex {
  let cached = indexCache.get(list);
  if (!cached) {
    cached = buildMessageIndex(list);
    indexCache.set(list, cached);
  }
  return cached;
}

// 使用索引优化的消息合并函数
// Index-optimized message compose function
function composeMessageWithIndex(message: TMessage, list: TMessage[], index: MessageIndex): TMessage[] {
  if (!message) return list || [];
  if (!list?.length) {
    // Update index when adding first message
    if (message.msg_id) {
      index.msgIdIndex.set(message.msg_id, 0);
    }
    return [message];
  }

  // 对于 tool_group 类型，使用原始的 composeMessage（因为涉及内部数组匹配）
  // For tool_group type, use original composeMessage (involves inner array matching)
  // After composeMessage, the returned list may have different length/ordering,
  // so we must invalidate the index to prevent stale lookups in subsequent calls.
  if (message.type === 'tool_group') {
    const result = composeMessage(message, list);
    if (result !== list) {
      // Rebuild index maps from the new list to keep them in sync
      const rebuilt = buildMessageIndex(result);
      index.msgIdIndex = rebuilt.msgIdIndex;
      index.callIdIndex = rebuilt.callIdIndex;
      index.toolCallIdIndex = rebuilt.toolCallIdIndex;
    }
    return result;
  }

  // tool_call: 使用 callIdIndex 快速查找
  // tool_call: use callIdIndex for fast lookup
  if (message.type === 'tool_call' && message.content?.callId) {
    const existingIdx = index.callIdIndex.get(message.content.callId);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    // 未找到，添加新消息并更新索引
    const newIdx = list.length;
    index.callIdIndex.set(message.content.callId, newIdx);
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // codex_tool_call: 使用 toolCallIdIndex 快速查找
  // codex_tool_call: use toolCallIdIndex for fast lookup
  if (message.type === 'codex_tool_call' && message.content?.toolCallId) {
    const existingIdx = index.toolCallIdIndex.get(message.content.toolCallId);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'codex_tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    // 未找到，添加新消息并更新索引
    const newIdx = list.length;
    index.toolCallIdIndex.set(message.content.toolCallId, newIdx);
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // acp_tool_call: 使用 toolCallIdIndex 快速查找
  // acp_tool_call: use toolCallIdIndex for fast lookup
  if (message.type === 'acp_tool_call' && message.content?.update?.toolCallId) {
    const existingIdx = index.toolCallIdIndex.get(message.content.update.toolCallId);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'acp_tool_call') {
        const newList = list.slice();
        const merged = { ...existingMsg.content, ...message.content };
        newList[existingIdx] = { ...existingMsg, content: merged };
        return newList;
      }
    }
    // 未找到，添加新消息并更新索引
    const newIdx = list.length;
    index.toolCallIdIndex.set(message.content.update.toolCallId, newIdx);
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // text message: use msgIdIndex for fast lookup (handles interleaved messages)
  // text 消息: 使用 msgIdIndex 快速查找（处理消息交错的情况）
  if (message.type === 'text' && (message.msg_id || message.id)) {
    const lookupKey = message.msg_id ?? message.id;
    const roleKey = textMessageStreamKey(message) ?? lookupKey;
    let existingIdx = index.msgIdIndex.get(roleKey);
    if (existingIdx === undefined && message.msg_id) {
      const legacyIdx = index.msgIdIndex.get(lookupKey);
      if (legacyIdx !== undefined && legacyIdx < list.length) {
        const legacyMsg = list[legacyIdx];
        if (legacyMsg.type === 'text' && legacyMsg.position === message.position) {
          existingIdx = legacyIdx;
        }
      }
    }
    if (existingIdx === undefined && message.id) {
      existingIdx = list.findIndex(
        (item) => item.id === message.id && item.type === 'text' && item.position === message.position
      );
    }
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (!existingMsg || existingMsg.type !== 'text') {
        const newIdx = list.length;
        index.msgIdIndex.set(roleKey, newIdx);
        return list.concat(message);
      }
      if (existingMsg.position !== message.position) {
        const newIdx = list.length;
        index.msgIdIndex.set(roleKey, newIdx);
        return list.concat(message);
      }
      // User messages are complete once sent, but file paths may be patched after copy-to-workspace.
      if (message.position === 'right') {
        const existingContent =
          typeof existingMsg.content === 'object' && 'content' in existingMsg.content
            ? String(existingMsg.content.content)
            : '';
        const nextContent =
          typeof message.content === 'object' && 'content' in message.content ? String(message.content.content) : '';
        if (existingContent === nextContent) {
          const statusChanged = existingMsg.status !== message.status;
          if (!statusChanged) {
            return list;
          }
        }
        const newList = list.slice();
        newList[existingIdx] = {
          ...existingMsg,
          ...message,
          content: message.content,
        } as TMessage;
        return newList;
      }
      // Complete teammate messages are not streaming chunks — skip if already exists
      if ((message.content as { teammateMessage?: boolean })?.teammateMessage) {
        return list;
      }
      // AI streaming messages (left position) — append chunks
      const newList = list.slice();
      newList[existingIdx] = {
        ...existingMsg,
        content: {
          ...existingMsg.content,
          content: existingMsg.content.content + message.content.content,
        },
      };
      return newList;
    }
    // Not found in index, add as new message
    const newIdx = list.length;
    index.msgIdIndex.set(roleKey, newIdx);
    return list.concat(message);
  }

  // thinking message: accumulate content chunks by msg_id (same logic as composeMessage)
  if (message.type === 'thinking' && message.msg_id) {
    const existingIdx = index.msgIdIndex.get(message.msg_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      if (existingMsg.type === 'thinking') {
        const newList = list.slice();
        if (message.content.status === 'done') {
          // Keep accumulated content, update status and duration
          newList[existingIdx] = {
            ...existingMsg,
            content: {
              ...existingMsg.content,
              status: 'done' as const,
              duration: message.content.duration,
            },
          };
        } else {
          // Append content chunk
          newList[existingIdx] = {
            ...existingMsg,
            content: {
              ...existingMsg.content,
              content: existingMsg.content.content + message.content.content,
              subject: message.content.subject || existingMsg.content.subject,
            },
          };
        }
        return newList;
      }
    }
    // First thinking message — add and index
    const newIdx = list.length;
    index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // plan message: update content and move to end of list
  if (message.type === 'plan' && message.msg_id) {
    const existingIdx = index.msgIdIndex.get(message.msg_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      const newList = list.slice();
      newList.splice(existingIdx, 1);
      const updated = { ...existingMsg, ...message, content: message.content } as TMessage;
      newList.push(updated);
      // Rebuild index after splice
      const rebuilt = buildMessageIndex(newList);
      index.msgIdIndex = rebuilt.msgIdIndex;
      index.callIdIndex = rebuilt.callIdIndex;
      index.toolCallIdIndex = rebuilt.toolCallIdIndex;
      return newList;
    }
    const newIdx = list.length;
    index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // agent_status / tips and other msg_id-based messages:
  // replace the existing item in place instead of appending duplicates.
  if (message.msg_id) {
    const existingIdx = index.msgIdIndex.get(message.msg_id);
    if (existingIdx !== undefined && existingIdx < list.length) {
      const existingMsg = list[existingIdx];
      const newList = list.slice();
      newList[existingIdx] = {
        ...existingMsg,
        ...message,
        content: message.content,
      } as TMessage;
      return newList;
    }
  }

  // Other types: fallback to last message check
  // 其他类型: 回退到检查最后一条消息
  const last = list[list.length - 1];
  if (
    !last ||
    last.msg_id !== message.msg_id ||
    last.type !== message.type ||
    (message.type === 'text' && last.type === 'text' && last.position !== message.position)
  ) {
    // Add new message and update index
    const newIdx = list.length;
    if (message.msg_id) index.msgIdIndex.set(message.msg_id, newIdx);
    return list.concat(message);
  }

  // Merge other message types with same msg_id
  const newList = list.slice();
  const lastIdx = newList.length - 1;
  newList[lastIdx] = { ...last, ...message };
  return newList;
}

export const useAddOrUpdateMessage = () => {
  const update = useUpdateMessageList();
  const pendingRef = useRef<Array<{ message: TMessage; add: boolean }>>([]);
  const flushFrameRef = useRef<number | null>(null);

  useEffect(() => {
    cancelPendingMessageUpdatesImpl = () => {
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      pendingRef.current = [];
    };
    return () => {
      if (cancelPendingMessageUpdatesImpl) {
        cancelPendingMessageUpdatesImpl = null;
      }
    };
  }, []);

  const flush = useCallback(() => {
    flushFrameRef.current = null;

    const pending = pendingRef.current;
    if (!pending.length) return;
    pendingRef.current = [];
    update((list) => {
      let newList = list;

      for (const item of pending) {
        const index = getOrBuildIndex(newList);
        if (item.add) {
          // 新增消息，更新索引
          // New message, update index
          const msg = item.message;
          const newIdx = newList.length;
          const streamKey = textMessageStreamKey(msg);
          if (streamKey) {
            index.msgIdIndex.set(streamKey, newIdx);
          } else if (msg.msg_id) {
            index.msgIdIndex.set(msg.msg_id, newIdx);
          } else if (msg.type === 'text' && msg.position === 'right' && msg.id) {
            index.msgIdIndex.set(msg.id, newIdx);
          }
          if (msg.type === 'tool_call' && msg.content?.callId) {
            index.callIdIndex.set(msg.content.callId, newIdx);
          }
          if (msg.type === 'codex_tool_call' && msg.content?.toolCallId) {
            index.toolCallIdIndex.set(msg.content.toolCallId, newIdx);
          }
          if (msg.type === 'acp_tool_call' && msg.content?.update?.toolCallId) {
            index.toolCallIdIndex.set(msg.content.update.toolCallId, newIdx);
          }
          newList = newList.concat(msg);
        } else {
          // 使用索引优化的消息合并
          // Use index-optimized message compose
          newList = composeMessageWithIndex(item.message, newList, index);
        }

        while (beforeUpdateMessageListStack.length) {
          newList = beforeUpdateMessageListStack.shift()!(newList);
        }
      }
      return newList;
    });

    if (pendingRef.current.length > 0) {
      flushFrameRef.current = requestAnimationFrame(flush);
    }
  }, [update]);

  useEffect(() => {
    return () => {
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
    };
  }, []);

  return useCallback(
    (message: TMessage, add = false) => {
      pendingRef.current.push({ message, add });
      if (flushFrameRef.current === null) {
        flushFrameRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );
};

export const useRemoveMessageByMsgId = () => {
  const update = useUpdateMessageList();

  return useCallback(
    (msgId: string) => {
      update((list) =>
        list.filter((message) => {
          if (message.id === msgId) {
            return false;
          }
          // Turn id is shared with assistant reply — only roll back the user bubble.
          if (message.msg_id === msgId && message.position === 'right') {
            return false;
          }
          return true;
        })
      );
    },
    [update]
  );
};

async function fetchConversationMessages(conversationId: string): Promise<TMessage[]> {
  const messages = await ipcBridge.database.getConversationMessages.invoke({
    conversation_id: conversationId,
    page: 0,
    pageSize: 10000,
  });
  return messages && Array.isArray(messages) ? messages : [];
}

async function fetchAndMergeConversationMessages(
  conversationId: string,
  update: (fn: (list: TMessage[]) => TMessage[]) => void
): Promise<void> {
  const messages = await fetchConversationMessages(conversationId);
  if (!messages.length) {
    update((currentList) => {
      const hasConversationMessages = currentList.some((m) => m.conversation_id === conversationId);
      return hasConversationMessages ? [] : currentList;
    });
    return;
  }
  update((currentList) => mergeDbMessagesWithStreaming(conversationId, messages, currentList));
}

/** After stream finish or explicit sync, DB is authoritative (avoids stale batched stream chunks). */
async function fetchAndReplaceConversationMessages(
  conversationId: string,
  update: (fn: (list: TMessage[]) => TMessage[]) => void
): Promise<void> {
  cancelPendingMessageUpdates();
  const messages = await fetchConversationMessages(conversationId);
  update((currentList) => {
    if (!messages.length) {
      const hasConversationMessages = currentList.some((m) => m.conversation_id === conversationId);
      return hasConversationMessages ? [] : currentList;
    }
    const sameConversation = currentList.filter((m) => m.conversation_id === conversationId);
    const baseline = sameConversation.length ? sameConversation : currentList;
    if (messageListsEquivalentForSync(baseline, messages)) {
      return currentList;
    }
    return replaceMessageListFromDb(messages);
  });
}

const MESSAGE_CACHE_SYNC_DEBOUNCE_MS = 150;

export const useMessageLstCache = (key: string) => {
  const update = useUpdateMessageList();
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key) return;
    cancelPendingMessageUpdates();
    update((currentList) => currentList.filter((m) => m.conversation_id === key));
    void fetchAndMergeConversationMessages(key, update).catch((error) => {
      console.error('[useMessageLstCache] Failed to load messages from database:', error);
    });
    return () => {
      cancelPendingMessageUpdates();
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [key, update]);

  useEffect(() => {
    if (!key) return;
    return addEventListener('conversation.messages.sync', ({ conversationId }) => {
      if (conversationId !== key) return;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null;
        void fetchAndReplaceConversationMessages(key, update).catch((error) => {
          console.error('[useMessageLstCache] Failed to sync messages from database:', error);
        });
      }, MESSAGE_CACHE_SYNC_DEBOUNCE_MS);
    });
  }, [key, update]);
};

export const beforeUpdateMessageList = (fn: (list: TMessage[]) => TMessage[]) => {
  beforeUpdateMessageListStack.push(fn);
  return () => {
    beforeUpdateMessageListStack.splice(beforeUpdateMessageListStack.indexOf(fn), 1);
  };
};
export { ChatKeyProvider, MessageListProvider, useChatKey, useMessageList, useUpdateMessageList };
