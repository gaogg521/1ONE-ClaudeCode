/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isImageFilePath, stripFilesMarker } from '@/common/chat/messageFiles';
import {
  buildImagePriorityReminderBlock,
  buildNativeVisionImageContextBlock,
  buildToolBasedImageContextBlock,
  messageAlreadyHasPromptAugmentation,
  userReferencesAttachmentPath,
} from '@/common/chat/attachmentContext';
import { buildGreetingReplyBlock, buildLanguageMatchBlock } from '@/common/chat/languagePolicy';
import { modelSupportsNativeVision } from '@/common/chat/modelVision';
import { prefetchWebContextForUserMessage, shouldPrefetchWebContext } from '@/common/web/prefetchWebContext';
import { buildAttachmentContextBlock } from '@process/services/attachmentTextExtractor';

export type PromptAugmentationInput = {
  /** User-visible message body (may include ONE_FILES_MARKER). */
  displayContent: string;
  /** Workspace-resolved attachment paths. */
  files: string[];
  /** Active model id — used to pick native vision vs tool-based image analysis. */
  modelId?: string;
  /** Agent backend — aionrs uses tool-based image analysis (files[] multimodal is unreliable). */
  agentType?: string;
  /** Whether to skip web prefetch (e.g. when caller already augmented). */
  skipWebPrefetch?: boolean;
};

function resolveFilesForTextExtraction(userText: string, files: string[], imagePaths: string[]): string[] {
  if (imagePaths.length === 0) {
    return files;
  }
  const nonImageFiles = files.filter((filePath) => !isImageFilePath(filePath));
  if (nonImageFiles.length === 0) {
    return [];
  }
  return nonImageFiles.filter((filePath) => userReferencesAttachmentPath(userText, filePath));
}

/**
 * Build hidden prompt prefixes for attachments + optional web URL/search prefetch.
 * Does not mutate the user-visible message body.
 */
export async function buildPromptAugmentationPrefix(input: PromptAugmentationInput): Promise<string> {
  const blocks: string[] = [];
  const userText = stripFilesMarker(input.displayContent);

  if (userText.trim()) {
    const greetingBlock = buildGreetingReplyBlock(userText);
    if (greetingBlock) {
      blocks.push(greetingBlock);
    } else {
      const languageBlock = buildLanguageMatchBlock(userText);
      if (languageBlock) {
        blocks.push(languageBlock);
      }
    }
  }

  const imagePaths = input.files.filter((filePath) => isImageFilePath(filePath));
  const filesForTextExtract = resolveFilesForTextExtraction(userText, input.files, imagePaths);

  if (filesForTextExtract.length > 0) {
    const attachmentBlock = await buildAttachmentContextBlock(filesForTextExtract);
    if (attachmentBlock) {
      blocks.push(attachmentBlock);
    }
  }

  if (imagePaths.length > 0) {
    if (filesForTextExtract.length < input.files.filter((f) => !isImageFilePath(f)).length) {
      blocks.push(buildImagePriorityReminderBlock());
    }
    const useToolBasedImages = input.agentType === 'aionrs' || !modelSupportsNativeVision(input.modelId);
    const imageBlock = useToolBasedImages
      ? buildToolBasedImageContextBlock(imagePaths)
      : buildNativeVisionImageContextBlock(imagePaths);
    if (imageBlock) {
      blocks.push(imageBlock);
    }
  }

  if (!input.skipWebPrefetch && !messageAlreadyHasPromptAugmentation(input.displayContent)) {
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
