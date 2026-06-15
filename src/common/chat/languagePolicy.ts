/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { wrapSystemReminder } from '@/common/chat/systemReminder';

/** @deprecated Hidden XML tag; aionrs ignores it — use system-reminder via wrapSystemReminder. */
export const LANGUAGE_POLICY_TAG = '1one-language-policy';

/** Short greetings where language mirroring hints cause awkward echo (e.g. 你好 → 你好你好). */
const CASUAL_GREETING = /^(你好|您好|嗨|哈喽|hi|hello|hey|morning|下午好|晚上好|早安)[!.?。！？~\s]*$/iu;

/** Hidden prefix for brief greetings — prevents awkward echo (你好 → 你好你好). */
export function buildGreetingReplyBlock(userText: string): string {
  const trimmed = userText.trim();
  if (!CASUAL_GREETING.test(trimmed)) {
    return '';
  }
  return wrapSystemReminder(
    'The user sent a brief greeting. Reply once in the same language with ONE natural greeting, then offer help. ' +
      'Example (Chinese): "你好！有什么可以帮你的？" Do NOT say 你好你好 or repeat 你好 twice.'
  );
}

/** Hidden prefix: agent replies in the same language as the user message. */
export function buildLanguageMatchBlock(userText: string): string {
  const trimmed = userText.trim();
  if (!trimmed || CASUAL_GREETING.test(trimmed)) {
    return '';
  }
  return wrapSystemReminder(
    "Reply in the same language as the user's message. " +
      'If the user writes in Chinese, reply in Chinese (简体中文). Do not switch to English unless the user uses English. ' +
      "Write naturally; do not echo or repeat the user's words (avoid 你好你好 when the user only said 你好)."
  );
}
