/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageSkillSuggest } from '@/common/chat/chatLib';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { getChatRailSurfaceStyle } from '@/renderer/utils/ui/contentRail';
import React from 'react';
import SkillSuggestCard from './SkillSuggestCard';

const MessageSkillSuggest: React.FC<{ message: IMessageSkillSuggest }> = ({ message }) => {
  const { cronJobId, name, description, skillContent } = message.content;
  const stretchLayout = Boolean(useConversationContextSafe()?.stretchLayout);

  return (
    <div className={stretchLayout ? 'w-full' : 'w-full mx-auto'} style={getChatRailSurfaceStyle('message', stretchLayout)}>
      <SkillSuggestCard suggestion={{ name, description, content: skillContent }} cronJobId={cronJobId} />
    </div>
  );
};

export default MessageSkillSuggest;
