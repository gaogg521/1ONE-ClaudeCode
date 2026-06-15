/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { stripFilesMarker } from '@/common/chat/messageFiles';
import { messageAlreadyHasPromptAugmentation } from '@/common/chat/attachmentContext';
import { prefetchWebContextForUserMessage, shouldPrefetchWebContext } from '@/common/web/prefetchWebContext';
import { buildAttachmentContextBlock } from '@process/services/attachmentTextExtractor';

export type PromptAugmentationInput = {
  /** User-visible message body (may include ONE_FILES_MARKER). */
  displayContent: string;
  /** Workspace-resolved attachment paths. */
  files: string[];
  /** Whether to skip web prefetch (e.g. when caller already augmented). */
  skipWebPrefetch?: boolean;
};

/**
 * Build hidden prompt prefixes for attachments + optional web URL/search prefetch.
 * Does not mutate the user-visible message body.
 */
export async function buildPromptAugmentationPrefix(input: PromptAugmentationInput): Promise<string> {
  const blocks: string[] = [];

  if (input.files.length > 0) {
    const attachmentBlock = await buildAttachmentContextBlock(input.files);
    if (attachmentBlock) {
      blocks.push(attachmentBlock);
    }
  }

  if (!input.skipWebPrefetch && !messageAlreadyHasPromptAugmentation(input.displayContent)) {
    const userText = stripFilesMarker(input.displayContent);
    if (shouldPrefetchWebContext(userText)) {
      const webPrefetch = await prefetchWebContextForUserMessage(userText);
      if (webPrefetch?.block) {
        blocks.push(webPrefetch.block);
      }
    }
  }

  return blocks.join('');
}

export function composeAgentPrompt(displayContent: string, augmentationPrefix: string): string {
  if (!augmentationPrefix) {
    return displayContent;
  }
  return `${augmentationPrefix}${displayContent}`;
}
