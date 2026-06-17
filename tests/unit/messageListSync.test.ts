/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  mergeDbMessagesWithStreaming,
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
});
