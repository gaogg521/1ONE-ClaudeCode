/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { parseDisplayMessageFiles } from '@/common/chat/messageFiles';
import { getDatabase } from '@process/services/database';

/** Collect attachment paths from recent user messages (newest first). */
export async function getRecentUserAttachmentPaths(conversationId: string, limit = 12): Promise<string[]> {
  const db = await getDatabase();
  const result = db.getConversationMessages(conversationId, 0, limit, 'DESC');
  const messages = result.data ?? [];
  const paths: string[] = [];

  for (const message of messages as TMessage[]) {
    if (message.position !== 'right' || message.type !== 'text') {
      continue;
    }
    const content = message.content?.content;
    if (typeof content !== 'string') {
      continue;
    }
    for (const filePath of parseDisplayMessageFiles(content)) {
      if (!paths.includes(filePath)) {
        paths.push(filePath);
      }
    }
  }

  return paths;
}
