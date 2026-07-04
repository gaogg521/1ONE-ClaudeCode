/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ported from upstream AionUi #2451 — bunx cache corruption detection/cleanup.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isBunxCacheCorruption, clearBunxCache } from '../../src/process/agent/acp/acpConnectors';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    rmSync: vi.fn(),
  };
});

const { rmSync } = await import('fs');
const rmSyncMock = vi.mocked(rmSync);

afterEach(() => {
  vi.clearAllMocks();
});

describe('isBunxCacheCorruption', () => {
  it('detects "Cannot find package" (Unix bun error)', () => {
    const stderr =
      "error: Cannot find package 'zod' from '/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0/node_modules/@agentclientprotocol/sdk/dist/acp.js'";
    expect(isBunxCacheCorruption(stderr)).toBe(true);
  });

  it('detects "Cannot find module" (Windows bun error)', () => {
    const stderr =
      "error: Cannot find module '@anthropic-ai/claude-agent-sdk' from 'C:\\Users\\test\\AppData\\Local\\Temp\\bunx-1743022513-@zed-industries\\claude-agent-acp@0.21.0\\node_modules\\@zed-industries\\claude-agent-acp\\dist\\acp-agent.js'";
    expect(isBunxCacheCorruption(stderr)).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isBunxCacheCorruption('Error: connect ECONNREFUSED 127.0.0.1:443')).toBe(false);
    expect(isBunxCacheCorruption('')).toBe(false);
  });
});

describe('clearBunxCache', () => {
  it('extracts and removes the Unix bunx cache dir', () => {
    const stderr =
      "error: Cannot find package 'zod' from '/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0/node_modules/@agentclientprotocol/sdk/dist/acp.js'";
    const cleared = clearBunxCache(stderr);
    expect(cleared).toBe('/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0');
    expect(rmSyncMock).toHaveBeenCalledWith(cleared, { recursive: true, force: true });
  });

  it('extracts and removes the Windows bunx cache dir', () => {
    const stderr =
      "error: Cannot find module 'x' from 'C:\\Users\\test\\AppData\\Local\\Temp\\bunx-1743022513-@zed-industries\\claude-agent-acp@0.21.0\\node_modules\\pkg\\index.js'";
    const cleared = clearBunxCache(stderr);
    expect(cleared).toBe('C:\\Users\\test\\AppData\\Local\\Temp\\bunx-1743022513-@zed-industries\\claude-agent-acp@0.21.0');
    expect(rmSyncMock).toHaveBeenCalled();
  });

  it('returns null when no bunx path is present', () => {
    expect(clearBunxCache('some random error')).toBeNull();
    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it('returns null when rmSync throws', () => {
    rmSyncMock.mockImplementation(() => {
      throw new Error('EPERM');
    });
    const stderr = "Cannot find package 'zod' from '/tmp/bunx-1-pkg/claude-agent-acp@1.0.0/node_modules/z/i.js'";
    expect(clearBunxCache(stderr)).toBeNull();
  });
});
