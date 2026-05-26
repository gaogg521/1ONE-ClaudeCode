/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import type { AcpBackend } from '@/common/types/acpTypes';
import LocalImageView from '@renderer/components/media/LocalImageView';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import { CHAT_RAIL_INLINE_PADDING_CLASS } from '@renderer/utils/ui/contentRail';
import React, { useEffect } from 'react';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import AcpSendBox from './AcpSendBox';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: AcpBackend;
  sessionMode?: string;
  cachedConfigOptions?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  agentName?: string;
  cronJobId?: string;
  hideSendBox?: boolean;
  teamId?: string;
  agentSlotId?: string;
  stretchLayout?: boolean;
}> = ({
  conversation_id,
  workspace,
  backend,
  sessionMode,
  cachedConfigOptions,
  agentName,
  cronJobId,
  hideSendBox,
  teamId,
  agentSlotId,
  stretchLayout,
}) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace || '' });
  }, [workspace]);

  return (
    <ConversationProvider
      value={{ conversationId: conversation_id, workspace, type: 'acp', cronJobId, hideSendBox, stretchLayout }}
    >
      <div className={`flex-1 flex flex-col min-h-0 ${CHAT_RAIL_INLINE_PADDING_CLASS}`}>
        <FlexFullContainer>
          <MessageList className='flex-1'></MessageList>
        </FlexFullContainer>
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              sessionMode={sessionMode}
              cachedConfigOptions={cachedConfigOptions}
              agentName={agentName}
              teamId={teamId}
              agentSlotId={agentSlotId}
            ></AcpSendBox>
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(AcpChat);
