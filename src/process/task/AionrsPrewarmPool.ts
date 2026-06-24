/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Aionrs prewarm pool — pool capacity 1.
 *
 * Goal: at the Guid page, once the user has chosen model + workspace and has paused
 * (debounce upstream), eagerly spawn an aionrs worker so its `readyPromise` (provider
 * connect + SSE handshake, ~2.8s) is already resolved when the user finally clicks send.
 *
 * Strategy "B" — prewarm-as-real-conversation:
 *  - prewarm() creates a placeholder conversation with name "__prewarm__" and starts the
 *    real AionrsManager against its real conversation_id. The binary's internal session_id
 *    is bound to this conversation_id from spawn, so when the placeholder is later
 *    "claimed" by the Guid send flow, we only need to overwrite the conversation's name /
 *    extra in the DB — no rewiring of the manager's id, no session-handover with the binary.
 *  - claim() returns the conversation_id (no kill — the manager stays in WorkerTaskManager).
 *  - evict() kills the worker, removes the placeholder conversation from the DB. Triggered
 *    by TTL expiry, by a configuration change, or when the placeholder is no longer the
 *    most recent prewarm.
 *
 * Capacity is fixed at 1: a user can only realistically be about to send one message at a
 * time. Rapid config flicks kill the previous warm and start a new one. TTL bounds memory
 * use if the user navigates away without sending.
 */

import type { IAgentManager } from './IAgentManager';
import type { IWorkerTaskManager } from './IWorkerTaskManager';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';

const DEFAULT_TTL_MS = 15_000;

export type PrewarmEntry = {
  key: string;
  conversation_id: string;
  manager: IAgentManager;
  createdAt: number;
};

export class AionrsPrewarmPool {
  private entry: (PrewarmEntry & { ttlTimer: ReturnType<typeof setTimeout> }) | undefined;
  private readonly ttlMs: number;

  constructor(
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly conversationRepo: IConversationRepository,
    options?: { ttlMs?: number }
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Register a freshly-spawned manager into the pool.
   *
   * If the pool already has an entry:
   *  - same key: keep the existing one, no-op (caller is responsible for not double-creating).
   *  - different key: evict the old entry before installing the new one.
   */
  register(entry: PrewarmEntry): void {
    if (this.entry?.key === entry.key && this.entry.conversation_id === entry.conversation_id) {
      // Same key + same id — refresh TTL only.
      this.refreshTtl();
      return;
    }
    if (this.entry) {
      this.evictInternal('replaced').catch(() => {
        // best-effort; do not block new registration
      });
    }
    const ttlTimer = setTimeout(() => {
      this.evictInternal('ttl').catch(() => {});
    }, this.ttlMs);
    // Allow process exit even if timer is pending.
    if (typeof ttlTimer.unref === 'function') ttlTimer.unref();
    this.entry = { ...entry, ttlTimer };
  }

  /** Returns the current entry's key, or undefined if pool is empty. Useful for dedup. */
  currentKey(): string | undefined {
    return this.entry?.key;
  }

  /** Returns the current entry's conversation_id for a matching key. */
  currentConversationIdFor(key: string): string | undefined {
    return this.entry?.key === key ? this.entry.conversation_id : undefined;
  }

  /**
   * Claim a prewarmed conversation for the current key.
   * Returns the conversation_id and the manager stays alive (WorkerTaskManager still
   * holds it). Returns null on miss.
   */
  claim(key: string): { conversation_id: string } | null {
    if (!this.entry || this.entry.key !== key) return null;
    clearTimeout(this.entry.ttlTimer);
    const conversation_id = this.entry.conversation_id;
    // Drop from pool — the manager continues to live in WorkerTaskManager.
    this.entry = undefined;
    return { conversation_id };
  }

  /**
   * Evict the current entry: kill the worker AND delete the placeholder conversation.
   * Public for external triggers (app shutdown, config-changed cascades).
   */
  async evict(): Promise<void> {
    await this.evictInternal('manual');
  }

  private refreshTtl(): void {
    if (!this.entry) return;
    clearTimeout(this.entry.ttlTimer);
    const ttlTimer = setTimeout(() => {
      this.evictInternal('ttl').catch(() => {});
    }, this.ttlMs);
    if (typeof ttlTimer.unref === 'function') ttlTimer.unref();
    this.entry = { ...this.entry, ttlTimer };
  }

  private async evictInternal(_reason: 'ttl' | 'replaced' | 'manual'): Promise<void> {
    const current = this.entry;
    if (!current) return;
    this.entry = undefined;
    clearTimeout(current.ttlTimer);
    try {
      this.workerTaskManager.kill(current.conversation_id);
    } catch {
      // best-effort
    }
    try {
      await this.conversationRepo.deleteConversation(current.conversation_id);
    } catch {
      // best-effort — orphan rows are cleaned up at startup by sweepPlaceholderConversations
    }
  }

  /**
   * Sweep stale placeholder conversations left behind by previous crashes / hard kills.
   * Called once at startup from workerTaskManagerSingleton.
   */
  static async sweepPlaceholderConversations(repo: IConversationRepository): Promise<void> {
    try {
      const all = await repo.listAllConversations();
      for (const conv of all) {
        if (conv.type === 'aionrs' && conv.name === PLACEHOLDER_CONVERSATION_NAME) {
          try {
            await repo.deleteConversation(conv.id);
          } catch {
            // best-effort
          }
        }
      }
    } catch {
      // best-effort
    }
  }
}

export const PLACEHOLDER_CONVERSATION_NAME = '__prewarm__';
