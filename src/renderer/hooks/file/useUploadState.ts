/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-level upload state store with React hook via useSyncExternalStore.
 * No Context Provider needed — any component can subscribe by calling useUploadState().
 *
 * Tracks active file uploads (count + per-file progress) so the UI can:
 * - disable the send button while uploads are in flight
 * - show an aggregated progress indicator
 */

import { useSyncExternalStore } from 'react';

export type UploadSource = 'sendbox' | 'workspace';

interface UploadStateSnapshot {
  /** Number of files currently being uploaded */
  activeCount: number;
  /** true when at least one upload is in progress */
  isUploading: boolean;
  /** Weighted average progress across all active uploads (0-100), 0 when idle */
  overallPercent: number;
}

// ── Internal store ─────────────────────────────────────────────────────────

interface UploadEntry {
  percent: number;
  size: number;
  source: UploadSource;
  /** Conversation this upload is bound to — used by abortUploads (upstream #3019) */
  conversationId?: string;
  /** Fires when the upload is aborted (e.g. conversation switched away) */
  onAbort?: () => void;
}

let nextId = 0;
const uploads = new Map<number, UploadEntry>();
const listeners = new Set<() => void>();

let globalSnapshot: UploadStateSnapshot = { activeCount: 0, isUploading: false, overallPercent: 0 };
const sourceSnapshots: Record<UploadSource, UploadStateSnapshot> = {
  sendbox: { activeCount: 0, isUploading: false, overallPercent: 0 },
  workspace: { activeCount: 0, isUploading: false, overallPercent: 0 },
};

function calcSnapshot(filter?: UploadSource): UploadStateSnapshot {
  let totalBytes = 0;
  let loadedBytes = 0;
  let count = 0;
  for (const u of uploads.values()) {
    if (filter && u.source !== filter) continue;
    count++;
    totalBytes += u.size;
    loadedBytes += u.size * (u.percent / 100);
  }
  if (count === 0) return { activeCount: 0, isUploading: false, overallPercent: 0 };
  return {
    activeCount: count,
    isUploading: true,
    overallPercent: totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0,
  };
}

function recalcSnapshot(): void {
  globalSnapshot = calcSnapshot();
  sourceSnapshots.sendbox = calcSnapshot('sendbox');
  sourceSnapshots.workspace = calcSnapshot('workspace');
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Public API for upload callers ──────────────────────────────────────────

export interface TrackUploadOptions {
  source?: UploadSource;
  /** Bind the upload to a conversation; used by abortUploads({ exceptConversationId }) */
  conversationId?: string;
  /** Called when the upload is aborted via abortUploads(...) */
  onAbort?: () => void;
}

/**
 * Register a new upload. Returns an object with:
 * - `id`: opaque handle
 * - `onProgress(percent)`: call from XHR progress handler
 * - `finish()`: call when upload completes (success, error, or abort)
 */
export function trackUpload(
  fileSize: number,
  sourceOrOptions: UploadSource | TrackUploadOptions = 'sendbox'
): {
  id: number;
  onProgress: (percent: number) => void;
  finish: () => void;
} {
  const opts: TrackUploadOptions = typeof sourceOrOptions === 'string' ? { source: sourceOrOptions } : sourceOrOptions;
  const id = nextId++;
  uploads.set(id, {
    percent: 0,
    size: fileSize,
    source: opts.source ?? 'sendbox',
    conversationId: opts.conversationId,
    onAbort: opts.onAbort,
  });
  recalcSnapshot();
  notify();

  return {
    id,
    onProgress(percent: number) {
      const entry = uploads.get(id);
      if (entry) {
        entry.percent = percent;
        recalcSnapshot();
        notify();
      }
    },
    finish() {
      uploads.delete(id);
      recalcSnapshot();
      notify();
    },
  };
}

/**
 * Abort in-flight uploads (upstream #3019). Fires each matching entry's
 * onAbort (which should cancel the underlying XHR — the caller's finally
 * block then removes the entry via finish()) and drops it from the store so
 * stray progress bars never leak into another conversation.
 *
 * @param filter.source                only abort uploads in this source bucket
 * @param filter.exceptConversationId  keep uploads bound to this conversation
 */
export function abortUploads(filter: { source?: UploadSource; exceptConversationId?: string | null } = {}): void {
  let changed = false;
  for (const [id, entry] of uploads.entries()) {
    if (filter.source && entry.source !== filter.source) continue;
    if (filter.exceptConversationId != null && entry.conversationId === filter.exceptConversationId) continue;
    try {
      entry.onAbort?.();
    } catch {
      // aborting is best-effort — never let one bad callback stop the sweep
    }
    uploads.delete(id);
    changed = true;
  }
  if (changed) {
    recalcSnapshot();
    notify();
  }
}

// ── Stable snapshot getters (module-level to avoid per-render closure churn) ─

const getGlobalSnapshot = (): UploadStateSnapshot => globalSnapshot;
const sourceSnapshotGetters: Record<UploadSource, () => UploadStateSnapshot> = {
  sendbox: () => sourceSnapshots.sendbox,
  workspace: () => sourceSnapshots.workspace,
};

// ── React hook ─────────────────────────────────────────────────────────────

/**
 * Subscribe to upload state. Pass a source to scope to that area only;
 * omit for global state.
 */
export function useUploadState(source?: UploadSource): UploadStateSnapshot {
  const getSnapshot = source ? sourceSnapshotGetters[source] : getGlobalSnapshot;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
