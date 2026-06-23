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
import AionrsSendBox from './AionrsSendBox';
import type { AionrsModelSelection } from './useAionrsModelSelection';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
  stretchLayout?: boolean;
  teamId?: string;
  tenantId?: string;
  agentSlotId?: string;
}> = ({ conversation_id, workspace, modelSelection, stretchLayout, teamId, tenantId, agentSlotId }) => {
  useMessageLstCache(conversation_id);
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return { conversationId: conversation_id, workspace, type: 'aionrs', stretchLayout };
  }, [conversation_id, workspace, stretchLayout]);

  return (
    <ConversationProvider value={conversationValue}>
      <div className={`flex-1 flex flex-col min-h-0 ${CHAT_RAIL_INLINE_PADDING_CLASS}`}>
        <FlexFullContainer>
          <MessageList className='flex-1' />
        </FlexFullContainer>
        <ConversationChatConfirm conversation_id={conversation_id}>
          <AionrsSendBox
            conversation_id={conversation_id}
            modelSelection={modelSelection}
            teamId={teamId}
            tenantId={tenantId}
            agentSlotId={agentSlotId}
          />
        </ConversationChatConfirm>
      </div>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, LocalImageView.Provider)(AionrsChat);
