/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import React from 'react';
import ChatWorkspace from '../Workspace';
import type { WorkspaceTab } from '../Workspace/types';

const ChatSider: React.FC<{
  conversation?: TChatConversation;
  initialTab?: WorkspaceTab;
}> = ({ conversation, initialTab }) => {
  const [messageApi, messageContext] = Message.useMessage({ maxCount: 1 });

  let workspaceNode: React.ReactNode = null;
  if (conversation?.type === 'gemini') {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        messageApi={messageApi}
        initialTab={initialTab}
      ></ChatWorkspace>
    );
  } else if (conversation?.type === 'acp' && conversation.extra?.workspace) {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        eventPrefix='acp'
        messageApi={messageApi}
        initialTab={initialTab}
      ></ChatWorkspace>
    );
  } else if (conversation?.type === 'codex' && conversation.extra?.workspace) {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        eventPrefix='codex'
        messageApi={messageApi}
        initialTab={initialTab}
      ></ChatWorkspace>
    );
  } else if (conversation?.type === 'aionrs' && conversation.extra?.workspace) {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        eventPrefix='aionrs'
        messageApi={messageApi}
        initialTab={initialTab}
      ></ChatWorkspace>
    );
  }

  if (!workspaceNode) {
    return <div></div>;
  }

  return (
    <>
      {messageContext}
      {workspaceNode}
    </>
  );
};

export default ChatSider;
