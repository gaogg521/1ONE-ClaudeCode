/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { ONE_FILES_MARKER } from '@/common/config/constants';
import {
  patchSentMessageContent,
  resolveSentDisplayContent,
  showUserMessageAfterSend,
} from '@/renderer/utils/file/patchSentMessage';

describe('resolveSentDisplayContent', () => {
  it('prefers resolved input from sendMessage', () => {
    const workspacePath = 'C:\\app\\1one\\aionrs-temp-1\\photo.png';
    const resolvedInput = `hello\n\n${ONE_FILES_MARKER}\n${workspacePath}`;
    expect(resolveSentDisplayContent({ data: { input: resolvedInput, files: [workspacePath] } }, 'fallback')).toBe(
      resolvedInput
    );
  });

  it('rebuilds display body from resolved files when input is missing', () => {
    const workspacePath = 'C:\\app\\1one\\aionrs-temp-1\\photo.png';
    const fallback = `hello\n\n${ONE_FILES_MARKER}\nC:\\app\\cache\\temp\\photo.png`;
    expect(resolveSentDisplayContent({ data: { files: [workspacePath] } }, fallback)).toBe(
      `hello\n\n${ONE_FILES_MARKER}\n${workspacePath}`
    );
  });
});

describe('patchSentMessageContent', () => {
  it('updates the existing optimistic message instead of appending a duplicate', () => {
    const addOrUpdateMessage = vi.fn();
    const workspacePath = 'C:\\app\\1one\\aionrs-temp-1\\photo.png';
    const resolvedInput = `hello\n\n${ONE_FILES_MARKER}\n${workspacePath}`;

    patchSentMessageContent(addOrUpdateMessage, 'conv-1', 'msg-1', {
      data: { input: resolvedInput, files: [workspacePath] },
    });

    expect(addOrUpdateMessage).toHaveBeenCalledTimes(1);
    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-1',
        msg_id: 'msg-1',
        content: { content: resolvedInput },
        status: 'finish',
      }),
      false
    );
  });
});

describe('showUserMessageAfterSend', () => {
  it('adds a new bubble when no optimistic message was shown', () => {
    const addOrUpdateMessage = vi.fn();
    const workspacePath = 'C:\\app\\1one\\aionrs-temp-1\\photo.png';
    const resolvedInput = `hello\n\n${ONE_FILES_MARKER}\n${workspacePath}`;

    showUserMessageAfterSend(
      addOrUpdateMessage,
      'conv-1',
      'msg-1',
      { data: { input: resolvedInput, files: [workspacePath] } },
      `hello\n\n${ONE_FILES_MARKER}\nC:\\app\\cache\\temp\\photo.png`,
      { showedOptimistic: false }
    );

    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: { content: resolvedInput }, status: 'finish' }),
      true
    );
  });

  it('updates the optimistic bubble when one was already shown', () => {
    const addOrUpdateMessage = vi.fn();

    showUserMessageAfterSend(addOrUpdateMessage, 'conv-1', 'msg-1', { data: { input: 'hello' } }, 'hello', {
      showedOptimistic: true,
    });

    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: { content: 'hello' }, status: 'finish' }),
      false
    );
  });
});
