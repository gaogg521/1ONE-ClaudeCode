/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      sendMessage: {
        invoke: (...args: unknown[]) => sendMessageMock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'msg-optimistic'),
}));

import { useAcpInitialMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage';

describe('useAcpInitialMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('optimistically shows the initial user message before IPC send resolves', async () => {
    sendMessageMock.mockReturnValue(new Promise(() => {}));
    sessionStorage.setItem('acp_initial_message_conv-1', JSON.stringify({ input: 'hello', files: [] }));
    const addOrUpdateMessage = vi.fn();

    renderHook(() =>
      useAcpInitialMessage({
        conversationId: 'conv-1',
        backend: 'codex',
        setAiProcessing: vi.fn(),
        checkAndUpdateTitle: vi.fn(),
        addOrUpdateMessage,
      })
    );

    await waitFor(() => {
      expect(addOrUpdateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          msg_id: 'msg-optimistic',
          conversation_id: 'conv-1',
          type: 'text',
          position: 'right',
          content: { content: 'hello' },
        }),
        true
      );
    });
    expect(sendMessageMock).toHaveBeenCalled();
  });
});
