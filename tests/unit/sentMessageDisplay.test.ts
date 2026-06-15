/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { ONE_FILES_MARKER } from '@/common/config/constants';
import {
  finalizeUserMessageAfterSend,
  prepareUserMessageSend,
  publishOptimisticUserMessage,
} from '@/renderer/utils/file/sentMessageDisplay';

describe('prepareUserMessageSend', () => {
  it('creates pending optimistic bubble when attachments are present', () => {
    const prepared = prepareUserMessageSend(
      'analyze this',
      ['C:\\cache\\temp\\photo.png'],
      'C:\\workspace',
      'msg-1',
      'conv-1'
    );

    expect(prepared.hasAttachments).toBe(true);
    expect(prepared.optimisticMessage?.status).toBe('pending');
    expect(prepared.optimisticMessage?.content).toEqual({ content: 'analyze this' });
    expect(prepared.displayMessage).toContain('photo.png');
    expect(prepared.displayMessage).toContain(ONE_FILES_MARKER);
  });

  it('creates text-only optimistic bubble when no attachments', () => {
    const prepared = prepareUserMessageSend('hello', [], 'C:\\workspace', 'msg-2', 'conv-1');

    expect(prepared.hasAttachments).toBe(false);
    expect(prepared.optimisticMessage?.status).toBeUndefined();
    expect(prepared.optimisticMessage?.content).toEqual({ content: 'hello' });
    expect(prepared.displayMessage).toBe('hello');
  });

  it('creates pending bubble for attachment-only sends', () => {
    const prepared = prepareUserMessageSend('', ['C:\\cache\\temp\\photo.png'], 'C:\\workspace', 'msg-3', 'conv-1');

    expect(prepared.hasAttachments).toBe(true);
    expect(prepared.optimisticMessage?.status).toBe('pending');
    expect(prepared.optimisticMessage?.content).toEqual({ content: '' });
  });
});

describe('publishOptimisticUserMessage', () => {
  it('skips add when optimistic message is null', () => {
    const addOrUpdateMessage = vi.fn();
    publishOptimisticUserMessage(addOrUpdateMessage, null);
    expect(addOrUpdateMessage).not.toHaveBeenCalled();
  });
});

describe('finalizeUserMessageAfterSend', () => {
  it('delegates to showUserMessageAfterSend with workspace-resolved content', () => {
    const addOrUpdateMessage = vi.fn();
    const workspacePath = 'C:\\workspace\\photo.png';
    const prepared = prepareUserMessageSend(
      'hello',
      ['C:\\cache\\temp\\photo.png'],
      'C:\\workspace',
      'msg-3',
      'conv-1'
    );

    finalizeUserMessageAfterSend(
      addOrUpdateMessage,
      'conv-1',
      'msg-3',
      { data: { input: `hello\n\n${ONE_FILES_MARKER}\n${workspacePath}`, files: [workspacePath] } },
      prepared.displayMessage,
      prepared
    );

    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { content: `hello\n\n${ONE_FILES_MARKER}\n${workspacePath}` },
        status: 'finish',
      }),
      false
    );
  });
});
