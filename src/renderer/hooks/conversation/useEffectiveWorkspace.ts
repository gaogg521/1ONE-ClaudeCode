/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';

/**
 * Resolve the conversation workspace synchronously from context when available,
 * with an async fallback from conversation.get for SendBox mounts.
 */
export function useEffectiveWorkspace(conversationId: string): string {
  const conversationContext = useConversationContextSafe();
  const [workspacePath, setWorkspacePath] = useState('');

  useEffect(() => {
    if (conversationContext?.workspace) {
      return;
    }
    void ipcBridge.conversation.get.invoke({ id: conversationId }).then((res) => {
      if (res?.extra?.workspace) {
        setWorkspacePath(res.extra.workspace);
      }
    });
  }, [conversationId, conversationContext?.workspace]);

  return conversationContext?.workspace || workspacePath;
}
