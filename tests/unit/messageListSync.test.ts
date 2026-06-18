/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  mergeDbMessagesWithStreaming,
  messageListSyncSignature,
  messageListsEquivalentForSync,
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
});
