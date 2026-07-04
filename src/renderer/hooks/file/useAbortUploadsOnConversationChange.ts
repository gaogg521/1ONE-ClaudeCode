/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { abortUploads, type UploadSource } from './useUploadState';

/**
 * Aborts in-flight uploads when the active conversation changes (or when the
 * caller unmounts). Ported from upstream AionUi #3019: without this, switching
 * conversations mid-upload leaks stray progress bars and thumbnails into the
 * new conversation.
 *
 * Each upload is bound to its `conversationId` at start time; this hook
 * cancels everything still running for the *previous* conversation as soon as
 * the user switches contexts, plus everything in the scoped `source` bucket
 * on unmount.
 *
 * @param conversationId Currently-active conversation id. Uploads bound to
 *   this id are kept; everything else in the given source is aborted.
 * @param source         Optional source to scope to (sendbox / workspace).
 */
export function useAbortUploadsOnConversationChange(conversationId: string | undefined, source?: UploadSource): void {
  useEffect(() => {
    abortUploads({ source, exceptConversationId: conversationId ?? null });
    return () => {
      // On unmount (e.g. closing the chat panel), abort everything in this
      // source bucket — those uploads have nowhere to surface their results.
      abortUploads({ source });
    };
  }, [conversationId, source]);
}
