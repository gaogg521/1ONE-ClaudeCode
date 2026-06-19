/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  hasStreamingOnlyMessages,
  mergeConversationMessagesFromDb,
  mergeDbMessagesWithStreaming,
  messageListSyncSignature,
  messageListsEquivalentForSync,
  replaceConversationMessagesInList,
  replaceMessageListFromDb,
} from '@/renderer/pages/conversation/Messages/messageListSync';

function textMessage(
  id: string,
  conversationId: string,
  content: string,
  position: 'left' | 'right' = 'left'
): TMessage {
  return {
    id,
    msg_id: id,
    conversation_id: conversationId,
    type: 'text',
    position,
    content: { content },
  } as TMessage;
}

describe('messageListSync', () => {
  it('replaceMessageListFromDb returns DB messages as-is', () => {
    const db = [textMessage('a1', 'conv-1', 'full assistant reply')];
    expect(replaceMessageListFromDb(db)).toEqual(db);
  });

  it('merge prefers longer streaming text while same msg_id is in flight', () => {
    const db = [textMessage('a1', 'conv-1', 'hello')];
    const stream = [textMessage('a1', 'conv-1', 'hello world')];
    const merged = mergeDbMessagesWithStreaming('conv-1', db, stream);
    expect((merged[0] as { content: { content: string } }).content.content).toBe('hello world');
  });

  it('merge prefers persisted DB row over divergent ephemeral stream id', () => {
    const db = [
      { ...textMessage('db-assistant', 'conv-1', 'CentOS terminal answer'), msg_id: 'turn-1' },
    ];
    const stream = [
      {
        ...textMessage('stream-assistant', 'conv-1', 'longer stale stream text that should lose'),
        msg_id: 'turn-1',
      },
    ];
    const merged = mergeDbMessagesWithStreaming('conv-1', db, stream);
    expect((merged[0] as { content: { content: string } }).content.content).toBe('CentOS terminal answer');
  });

  it('merge prefers DB when DB has longer text than stale stream chunk', () => {
    const db = [textMessage('a1', 'conv-1', 'complete answer from sqlite')];
    const stream = [textMessage('a1', 'conv-1', 'partial')];
    const merged = mergeDbMessagesWithStreaming('conv-1', db, stream);
    expect((merged[0] as { content: { content: string } }).content.content).toBe('complete answer from sqlite');
  });

  it('replace scenario: DB full reply replaces partial stream list entirely', () => {
    const db = [textMessage('a1', 'conv-1', 'CentOS terminal shows operone-deploy error')];
    const staleUi = [textMessage('a1', 'conv-1', 'Analyzing')];
    const replaced = replaceMessageListFromDb(db);
    expect(replaced).not.toEqual(staleUi);
    expect((replaced[0] as { content: { content: string } }).content.content).toContain('CentOS');
  });

  it('merge keeps streaming-only messages not yet in DB', () => {
    const db = [textMessage('db-1', 'conv-1', 'from db')];
    const stream = [textMessage('tool-1', 'conv-1', 'running'), textMessage('db-1', 'conv-1', 'from db stream')];
    (stream[0] as { type: string }).type = 'tool_group';
    const merged = mergeDbMessagesWithStreaming('conv-1', db, stream);
    expect(merged.map((m) => m.id)).toEqual(['db-1', 'tool-1']);
  });

  it('merge does not cross-merge user and assistant sharing turn msg_id', () => {
    const turnId = 'turn-1';
    const db = [
      { ...textMessage('user-1', 'conv-1', '你好', 'right'), msg_id: turnId },
      { ...textMessage('asst-1', 'conv-1', 'hello', 'left'), msg_id: turnId, id: 'asst-1' },
    ];
    const stream = [
      { ...textMessage('user-1', 'conv-1', '你好', 'right'), msg_id: turnId },
      {
        ...textMessage('asst-stream', 'conv-1', 'hello there', 'left'),
        msg_id: turnId,
        id: 'asst-stream',
      },
    ];
    const merged = mergeDbMessagesWithStreaming('conv-1', db, stream);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.position === 'right')?.content.content).toBe('你好');
    expect(merged.find((m) => m.position === 'left')?.content.content).toBe('hello there');
  });

  it('messageListSyncSignature changes when streaming tail grows', () => {
    const partial = [textMessage('a1', 'conv-1', 'hello')];
    const full = [textMessage('a1', 'conv-1', 'hello world')];
    expect(messageListSyncSignature(partial)).not.toBe(messageListSyncSignature(full));
  });

  it('messageListsEquivalentForSync returns true for identical lists', () => {
    const a = [
      { ...textMessage('u1', 'conv-1', '你好', 'right'), msg_id: 'turn-1' },
      { ...textMessage('a1', 'conv-1', 'hi', 'left'), msg_id: 'turn-1', id: 'a1' },
    ];
    const b = [
      { ...textMessage('u1', 'conv-1', '你好', 'right'), msg_id: 'turn-1' },
      { ...textMessage('a1', 'conv-1', 'hi', 'left'), msg_id: 'turn-1', id: 'a1' },
    ];
    expect(messageListsEquivalentForSync(a, b)).toBe(true);
  });

  it('messageListsEquivalentForSync returns false when assistant text differs', () => {
    const a = [textMessage('a1', 'conv-1', 'partial')];
    const b = [textMessage('a1', 'conv-1', 'complete answer')];
    expect(messageListsEquivalentForSync(a, b)).toBe(false);
  });

  it('merge prefers longer in-flight thinking content by msg_id', () => {
    const db = [
      {
        id: 'think-db',
        msg_id: 'think-1',
        conversation_id: 'conv-1',
        type: 'thinking',
        position: 'left',
        content: { content: 'Analy', status: 'thinking' },
      } as TMessage,
    ];
    const stream = [
      {
        id: 'think-stream',
        msg_id: 'think-1',
        conversation_id: 'conv-1',
        type: 'thinking',
        position: 'left',
        content: { content: 'Analyzing image...', status: 'thinking' },
      } as TMessage,
    ];
    const merged = mergeDbMessagesWithStreaming('conv-1', db, stream);
    expect((merged[0] as { content: { content: string } }).content.content).toBe('Analyzing image...');
  });

  it('messageListsEquivalentForSync returns false when thinking content differs', () => {
    const a = [
      {
        ...textMessage('a1', 'conv-1', 'x'),
        type: 'thinking',
        content: { content: 'short', status: 'thinking' },
      } as TMessage,
    ];
    const b = [
      {
        ...textMessage('a1', 'conv-1', 'x'),
        type: 'thinking',
        content: { content: 'longer thinking body', status: 'thinking' },
      } as TMessage,
    ];
    expect(messageListsEquivalentForSync(a, b)).toBe(false);
  });

  it('messageListSyncSignature changes when thinking tail grows', () => {
    const partial = [
      {
        ...textMessage('t1', 'conv-1', ''),
        type: 'thinking',
        content: { content: 'think', status: 'thinking' },
      } as TMessage,
    ];
    const full = [
      {
        ...textMessage('t1', 'conv-1', ''),
        type: 'thinking',
        content: { content: 'thinking more', status: 'thinking' },
      } as TMessage,
    ];
    expect(messageListSyncSignature(partial)).not.toBe(messageListSyncSignature(full));
  });

  it('replaceConversationMessagesInList preserves other conversations', () => {
    const other = textMessage('other-1', 'conv-other', 'keep me');
    const current = [other, textMessage('a1', 'conv-1', 'stale')];
    const db = [textMessage('a1', 'conv-1', 'fresh from db')];
    const next = replaceConversationMessagesInList(current, 'conv-1', db);
    expect(next).toHaveLength(2);
    expect(next[0]?.conversation_id).toBe('conv-other');
    expect((next[1] as { content: { content: string } }).content.content).toBe('fresh from db');
  });

  it('replaceConversationMessagesInList skips no-op when signature matches', () => {
    const current = [textMessage('a1', 'conv-1', 'same')];
    const db = [textMessage('a1', 'conv-1', 'same')];
    const next = replaceConversationMessagesInList(current, 'conv-1', db);
    expect(next).toBe(current);
  });

  it('mergeConversationMessagesFromDb keeps list reference when DB matches UI', () => {
    const current = [textMessage('a1', 'conv-1', 'same')];
    const db = [textMessage('a1', 'conv-1', 'same')];
    const next = mergeConversationMessagesFromDb('conv-1', db, current);
    expect(next).toBe(current);
  });

  it('mergeConversationMessagesFromDb still merges longer streaming tail', () => {
    const db = [textMessage('a1', 'conv-1', 'hello')];
    const current = [textMessage('a1', 'conv-1', 'hello world')];
    const next = mergeConversationMessagesFromDb('conv-1', db, current);
    expect((next[0] as { content: { content: string } }).content.content).toBe('hello world');
  });

  it('mergeConversationMessagesFromDb preserves UI when DB snapshot is still empty', () => {
    const current = [
      textMessage('u1', 'conv-1', '你好', 'right'),
      textMessage('a1', 'conv-1', '你好，我是助手', 'left'),
    ];
    const next = mergeConversationMessagesFromDb('conv-1', [], current);
    expect(next).toBe(current);
  });

  it('replaceConversationMessagesInList preserves UI when DB snapshot is still empty', () => {
    const current = [textMessage('a1', 'conv-1', 'in-flight reply')];
    const next = replaceConversationMessagesInList(current, 'conv-1', []);
    expect(next).toBe(current);
  });

  it('hasStreamingOnlyMessages detects tool rows not yet in DB', () => {
    const db = [textMessage('a1', 'conv-1', 'done')];
    const ui = [
      textMessage('a1', 'conv-1', 'done'),
      { ...textMessage('tool-1', 'conv-1', ''), type: 'tool_group', content: [] } as TMessage,
    ];
    expect(hasStreamingOnlyMessages(ui, db)).toBe(true);
  });
});
