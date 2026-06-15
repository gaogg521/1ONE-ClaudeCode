import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import {
  finalizeUserMessageAfterSend,
  prepareUserMessageSend,
  publishOptimisticUserMessage,
} from '@/renderer/utils/file/sentMessageDisplay';
import { emitter } from '@/renderer/utils/emitter';
import { useEffect } from 'react';

type UseGeminiInitialMessageParams = {
  conversationId: string;
  currentModelId: string | undefined;
  hasNoAuth: boolean;
  setContent: (content: string) => void;
  setUploadFile: (files: string[] | ((prev: string[]) => string[])) => void;
  setActiveMsgId: (msgId: string | null) => void;
  setWaitingResponse: (waiting: boolean) => void;
  autoSwitchTriggeredRef: React.MutableRefObject<boolean>;
  setShowSetupCard: (show: boolean) => void;
  performFullCheck: () => Promise<void>;
};

/**
 * Side-effect hook that handles sending (or storing) the initial message
 * from the guide page, which is passed via sessionStorage.
 */
export const useGeminiInitialMessage = ({
  conversationId,
  currentModelId,
  hasNoAuth,
  setContent,
  setUploadFile,
  setActiveMsgId,
  setWaitingResponse,
  autoSwitchTriggeredRef,
  setShowSetupCard,
  performFullCheck,
}: UseGeminiInitialMessageParams): void => {
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const performFullCheckRef = useLatestRef(performFullCheck);

  useEffect(() => {
    const storageKey = `gemini_initial_message_${conversationId}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    if (hasNoAuth) {
      try {
        const { input, files = [] } = JSON.parse(storedMessage) as { input: string; files?: string[] };
        setContent(input);
        if (files.length > 0) {
          setUploadFile(files);
        }
        sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore parse errors
      }
      if (!autoSwitchTriggeredRef.current) {
        autoSwitchTriggeredRef.current = true;
        setShowSetupCard(true);
        void performFullCheckRef.current();
      }
      return;
    }

    if (!currentModelId) return;

    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      const msg_id = uuid();

      try {
        const { input, files = [] } = JSON.parse(storedMessage) as { input: string; files?: string[] };

        setActiveMsgId(msg_id);
        setWaitingResponse(true);

        const prepared = prepareUserMessageSend(input, files, '', msg_id, conversationId);
        publishOptimisticUserMessage(addOrUpdateMessage, prepared.optimisticMessage);

        void checkAndUpdateTitle(conversationId, input);
        const result = await ipcBridge.geminiConversation.sendMessage.invoke({
          input: prepared.displayMessage,
          msg_id,
          conversation_id: conversationId,
          files,
        });
        assertBridgeSuccess(result, 'Failed to send initial message to Gemini');
        finalizeUserMessageAfterSend(
          addOrUpdateMessage,
          conversationId,
          msg_id,
          result,
          prepared.displayMessage,
          prepared
        );

        emitter.emit('chat.history.refresh');
        if (files.length > 0) {
          emitter.emit('gemini.workspace.refresh');
        }
      } catch (error) {
        console.error('Failed to send initial message:', error);
        removeMessageByMsgId(msg_id);
        setActiveMsgId(null);
        setWaitingResponse(false);
      }
    };

    void sendInitialMessage();
  }, [conversationId, currentModelId]);
};
