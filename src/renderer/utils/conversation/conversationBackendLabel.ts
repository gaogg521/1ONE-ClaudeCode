/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getBackendKeyFromConversation } from '@/renderer/pages/conversation/GroupedHistory/utils/exportHelpers';

export type ConversationBackendLabel = {
  label: string;
  color: string;
};

const BACKEND_LABEL: Record<string, ConversationBackendLabel> = {
  claude: { label: 'Claude Code', color: 'blue' },
  gemini: { label: 'Gemini', color: 'green' },
  aionrs: { label: '1ONE CODE', color: 'arcoblue' },
  qwen: { label: 'Qwen', color: 'orangered' },
  codex: { label: 'Codex', color: 'purple' },
  codebuddy: { label: 'CodeBuddy', color: 'cyan' },
  opencode: { label: 'OpenCode', color: 'gold' },
  'openclaw-gateway': { label: 'OpenClaw', color: 'magenta' },
  nanobot: { label: 'Nanobot', color: 'lime' },
  remote: { label: 'Remote', color: 'gray' },
};

/** Resolve UI badge for a conversation's agent/runtime type. */
export function getConversationBackendLabel(conv: TChatConversation): ConversationBackendLabel {
  const key = getBackendKeyFromConversation(conv) ?? conv.type;
  if (key && BACKEND_LABEL[key]) {
    return BACKEND_LABEL[key];
  }
  if (conv.type === 'gemini') {
    return BACKEND_LABEL.gemini;
  }
  if (conv.type === 'aionrs') {
    return BACKEND_LABEL.aionrs;
  }
  if (conv.type === 'codex') {
    return BACKEND_LABEL.codex;
  }
  return { label: key || conv.type, color: 'arcoblue' };
}
