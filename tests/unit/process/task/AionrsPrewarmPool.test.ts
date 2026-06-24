/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AionrsPrewarmPool, PLACEHOLDER_CONVERSATION_NAME } from '@process/task/AionrsPrewarmPool';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { IAgentManager } from '@process/task/IAgentManager';

const makeManager = (): IAgentManager =>
  ({ kill: vi.fn(), type: 'aionrs', lastActivityAt: Date.now() }) as unknown as IAgentManager;

const makeWorkerTaskManager = (): IWorkerTaskManager =>
  ({
    kill: vi.fn(),
    getTask: vi.fn(),
    getOrBuildTask: vi.fn(),
    addTask: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
  }) as unknown as IWorkerTaskManager;

const makeRepo = (): IConversationRepository =>
  ({
    deleteConversation: vi.fn(async () => {}),
    listAllConversations: vi.fn(async () => []),
  }) as unknown as IConversationRepository;

describe('AionrsPrewarmPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('register/claim happy path: hit returns conversation_id and clears the slot', () => {
    const wtm = makeWorkerTaskManager();
    const repo = makeRepo();
    const pool = new AionrsPrewarmPool(wtm, repo, { ttlMs: 1_000 });

    pool.register({ key: 'k1', conversation_id: 'c1', manager: makeManager(), createdAt: Date.now() });
    expect(pool.currentKey()).toBe('k1');

    const claimed = pool.claim('k1');
    expect(claimed).toEqual({ conversation_id: 'c1' });
    // After claim, the slot is empty so a second claim misses.
    expect(pool.claim('k1')).toBeNull();
    // Worker stays alive — manager is now owned by WorkerTaskManager, not the pool.
    expect(wtm.kill).not.toHaveBeenCalled();
    expect(repo.deleteConversation).not.toHaveBeenCalled();
  });

  it('claim misses on different key', () => {
    const pool = new AionrsPrewarmPool(makeWorkerTaskManager(), makeRepo(), { ttlMs: 1_000 });
    pool.register({ key: 'k1', conversation_id: 'c1', manager: makeManager(), createdAt: Date.now() });
    expect(pool.claim('k-other')).toBeNull();
    // Old slot still held — caller can retry with the right key.
    expect(pool.currentKey()).toBe('k1');
  });

  it('register with a different key evicts the old entry (kill + deleteConversation)', () => {
    const wtm = makeWorkerTaskManager();
    const repo = makeRepo();
    const pool = new AionrsPrewarmPool(wtm, repo, { ttlMs: 1_000 });

    pool.register({ key: 'k1', conversation_id: 'c1', manager: makeManager(), createdAt: Date.now() });
    pool.register({ key: 'k2', conversation_id: 'c2', manager: makeManager(), createdAt: Date.now() });
    // Microtask flush to let evictInternal's await chain run.
    return Promise.resolve().then(() => {
      expect(wtm.kill).toHaveBeenCalledWith('c1');
      expect(repo.deleteConversation).toHaveBeenCalledWith('c1');
      expect(pool.currentKey()).toBe('k2');
    });
  });

  it('register with same key + same id is a no-op (no kill, no delete) and refreshes TTL', () => {
    const wtm = makeWorkerTaskManager();
    const repo = makeRepo();
    const pool = new AionrsPrewarmPool(wtm, repo, { ttlMs: 1_000 });

    pool.register({ key: 'k1', conversation_id: 'c1', manager: makeManager(), createdAt: Date.now() });
    pool.register({ key: 'k1', conversation_id: 'c1', manager: makeManager(), createdAt: Date.now() });

    expect(wtm.kill).not.toHaveBeenCalled();
    expect(repo.deleteConversation).not.toHaveBeenCalled();
    expect(pool.currentKey()).toBe('k1');
  });

  it('TTL expiry evicts the entry automatically', async () => {
    const wtm = makeWorkerTaskManager();
    const repo = makeRepo();
    const pool = new AionrsPrewarmPool(wtm, repo, { ttlMs: 1_000 });

    pool.register({ key: 'k1', conversation_id: 'c1', manager: makeManager(), createdAt: Date.now() });
    expect(pool.currentKey()).toBe('k1');

    await vi.advanceTimersByTimeAsync(1_001);
    expect(wtm.kill).toHaveBeenCalledWith('c1');
    expect(repo.deleteConversation).toHaveBeenCalledWith('c1');
    expect(pool.currentKey()).toBeUndefined();
  });

  it('sweepPlaceholderConversations removes only __prewarm__ aionrs rows', async () => {
    const deleted: string[] = [];
    const repo = {
      listAllConversations: vi.fn(async () => [
        { id: 'a', type: 'aionrs', name: PLACEHOLDER_CONVERSATION_NAME },
        { id: 'b', type: 'aionrs', name: 'real chat' },
        { id: 'c', type: 'gemini', name: PLACEHOLDER_CONVERSATION_NAME }, // wrong type — ignore
      ]),
      deleteConversation: vi.fn(async (id: string) => {
        deleted.push(id);
      }),
    } as unknown as IConversationRepository;

    await AionrsPrewarmPool.sweepPlaceholderConversations(repo);
    expect(deleted).toEqual(['a']);
  });
});
