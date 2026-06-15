/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { uuid } from '@/common/utils';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import {
  finalizeUserMessageAfterSend,
  prepareUserMessageSend,
  publishOptimisticUserMessage,
} from '@/renderer/utils/file/sentMessageDisplay';
import { emitter } from '@/renderer/utils/emitter';
import { useEffect } from 'react';

type UseAcpInitialMessageParams = {
  conversationId: string;
  backend: string;
  effectiveWorkspace: string;
  setAiProcessing: (value: boolean) => void;
  checkAndUpdateTitle: (conversationId: string, input: string) => void;
  addOrUpdateMessage: (message: TMessage, prepend?: boolean) => void;
  removeMessageByMsgId: (msgId: string) => void;
};

/**
 * Side-effect-only hook that checks sessionStorage for an initial message
 * and sends it when the ACP conversation first mounts.
 */
export const useAcpInitialMessage = ({
  conversationId,
  backend,
  effectiveWorkspace,
  setAiProcessing,
  checkAndUpdateTitle,
  addOrUpdateMessage,
  removeMessageByMsgId,
}: UseAcpInitialMessageParams): void => {
  useEffect(() => {
    const storageKey = `acp_initial_message_${conversationId}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      const msg_id = uuid();

      try {
        const initialMessage = JSON.parse(storedMessage) as { input: string; files?: string[] };
        const { input, files = [] } = initialMessage;

        const prepared = prepareUserMessageSend(input, files, effectiveWorkspace, msg_id, conversationId);
        publishOptimisticUserMessage(addOrUpdateMessage, prepared.optimisticMessage);

        setAiProcessing(true);

        void checkAndUpdateTitle(conversationId, input);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: prepared.displayMessage,
          msg_id,
          conversation_id: conversationId,
          files,
        });

        assertBridgeSuccess(result, `Failed to send initial message to ${backend}`);
        finalizeUserMessageAfterSend(
          addOrUpdateMessage,
          conversationId,
          msg_id,
          result,
          prepared.displayMessage,
          prepared
        );
        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('[ACP-FRONTEND] Failed to send initial message:', error);
        removeMessageByMsgId(msg_id);
        const errorMessage: TMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id: conversationId,
          type: 'tips',
          position: 'center',
          content: {
            content: 'Failed to send message. Please try again.',
            type: 'error',
          },
          createdAt: Date.now() + 2,
        };
        addOrUpdateMessage(errorMessage, true);
        setAiProcessing(false);
      }
    };

    sendInitialMessage().catch((error) => {
      console.error('Failed to send initial message:', error);
    });
  }, [conversationId, backend, effectiveWorkspace]);
};
