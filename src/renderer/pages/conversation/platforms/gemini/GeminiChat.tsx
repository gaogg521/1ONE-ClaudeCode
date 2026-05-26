/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import { CHAT_RAIL_INLINE_PADDING_CLASS } from '@renderer/utils/ui/contentRail';
import React, { useEffect, useMemo } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import GeminiSendBox from './GeminiSendBox';
import type { GeminiModelSelection } from './useGeminiModelSelection';

// GeminiChat 接收共享的模型选择状态，避免组件内重复管理
// GeminiChat consumes shared model selection state to avoid duplicate logic
const GeminiChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: GeminiModelSelection;
  cronJobId?: string;
  hideSendBox?: boolean;
  stretchLayout?: boolean;
}> = ({ conversation_id, workspace, modelSelection, cronJobId, hideSendBox, stretchLayout }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversationId: conversation_id, workspace, type: 'gemini', cronJobId, hideSendBox, stretchLayout };
  }, [conversation_id, workspace, cronJobId, hideSendBox, stretchLayout]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className={`flex-1 flex flex-col min-h-0 ${CHAT_RAIL_INLINE_PADDING_CLASS}`}>
        <FlexFullContainer>
          <MessageList className='flex-1'></MessageList>
        </FlexFullContainer>
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <GeminiSendBox conversation_id={conversation_id} modelSelection={modelSelection}></GeminiSendBox>
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(GeminiChat);
