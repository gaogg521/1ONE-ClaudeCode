/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import { CHAT_RAIL_INLINE_PADDING_CLASS } from '@renderer/utils/ui/contentRail';
import React, { useEffect } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import NanobotSendBox from './NanobotSendBox';

const NanobotChat: React.FC<{
  conversation_id: string;
  workspace: string;
  cronJobId?: string;
  hideSendBox?: boolean;
  stretchLayout?: boolean;
}> = ({ conversation_id, workspace, cronJobId, hideSendBox, stretchLayout }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace, updateLocalImage]);
  return (
    <ConversationProvider
      value={{ conversationId: conversation_id, workspace, type: 'nanobot', cronJobId, hideSendBox, stretchLayout }}
    >
      <div className={`flex-1 flex flex-col min-h-0 ${CHAT_RAIL_INLINE_PADDING_CLASS}`}>
        <FlexFullContainer>
          <MessageList className='flex-1'></MessageList>
        </FlexFullContainer>
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <NanobotSendBox conversation_id={conversation_id} />
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(NanobotChat);
