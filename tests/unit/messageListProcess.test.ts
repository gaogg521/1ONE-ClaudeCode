/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  buildProcessedMessageList,
  canIncrementallyUpdateProcessedList,
  updateProcessedMessageListTail,
} from '@/renderer/pages/conversation/Messages/messageListProcess';

function textMessage(
  id: string,
  content: string,
  position: 'left' | 'right' = 'left'
): TMessage {
  return {
    id,
    msg_id: id,
    conversation_id: 'conv-1',
    type: 'text',
    position,
    content: { content },
  } as TMessage;
}

describe('messageListProcess', () => {
  it('buildProcessedMessageList maps plain text messages 1:1', () => {
    const list = [textMessage('a1', 'hello'), textMessage('a2', 'world')];
    const processed = buildProcessedMessageList(list);
    expect(processed).toHaveLength(2);
    expect((processed[0] as TMessage).content.content).toBe('hello');
  });

  it('canIncrementallyUpdateProcessedList allows streaming tail growth', () => {
    const prev = [textMessage('a1', 'hello')];
    const next = [prev[0], textMessage('a2', 'world')];
    expect(canIncrementallyUpdateProcessedList(prev, next)).toBe(true);
  });

  it('updateProcessedMessageListTail appends without full rebuild', () => {
    const prev = [textMessage('a1', 'hello')];
    const next = [prev[0], textMessage('a2', 'world')];
    const processed = buildProcessedMessageList(prev);
    const patched = updateProcessedMessageListTail(processed, prev, next);
    expect(patched).toHaveLength(2);
    expect((patched[1] as TMessage).content.content).toBe('world');
  });

  it('updateProcessedMessageListTail patches in-place streaming text', () => {
    const prev = [textMessage('a1', 'hel')];
    const next = [textMessage('a1', 'hello')];
    const processed = buildProcessedMessageList(prev);
    const patched = updateProcessedMessageListTail(processed, prev, next);
    expect(patched).toHaveLength(1);
    expect((patched[0] as TMessage).content.content).toBe('hello');
  });

  it('updateProcessedMessageListTail returns null when prefix references change', () => {
    const prev = [textMessage('a1', 'hello')];
    const next = [textMessage('a1', 'changed'), textMessage('a2', 'new')];
    const processed = buildProcessedMessageList(prev);
    expect(updateProcessedMessageListTail(processed, prev, next)).toBeNull();
  });
});
