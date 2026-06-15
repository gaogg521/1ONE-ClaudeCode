/**
 * @license
 * Copyright 2025 1ONE ClaudeCode (1one-claudecode.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock dependencies before importing the module
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: vi.fn().mockReturnValue({ cacheDir: '/tmp/cache' }),
  ProcessConfig: {
    get: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/webserver/auth/middleware/TokenMiddleware')>();
  return {
    ...actual,
    TokenMiddleware: {
      ...actual.TokenMiddleware,
      validateToken: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
    },
  };
});

// Import actual functions after mocks
import { resolveUploadWorkspace } from '../../src/process/webserver/routes/apiRoutes';
import { getDatabase } from '@process/services/database';

describe('apiRoutes - resolveUploadWorkspace', () => {
  const baseUser = { id: 'user-1', tenant_id: 'default', role: 'member' as const };

  function mockDbWithConversation(row: { user_id: string; team_id: string | null; extra: string } | undefined) {
    const prepare = vi.fn((sql: string) => ({
      get: vi.fn((...args: unknown[]) => {
        if (sql.includes('FROM conversations')) {
          return row;
        }
        if (sql.includes('FROM team_memberships')) {
          return undefined;
        }
        return undefined;
      }),
    }));

    return {
      getDriver: vi.fn(() => ({
        prepare,
      })),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when conversationId is empty', async () => {
    await expect(resolveUploadWorkspace('', '/workspace', baseUser)).rejects.toThrow('Missing conversation id');
  });

  it('throws error when conversationId is undefined-like', async () => {
    await expect(resolveUploadWorkspace('' as string, undefined, baseUser)).rejects.toThrow('Missing conversation id');
  });

  it('throws error when conversation workspace not found', async () => {
    vi.mocked(getDatabase).mockResolvedValue(mockDbWithConversation(undefined) as any);

    await expect(resolveUploadWorkspace('conv-123', undefined, baseUser)).rejects.toThrow(
      'Conversation workspace not found'
    );
  });

  it('throws error when conversation has no workspace', async () => {
    vi.mocked(getDatabase).mockResolvedValue(
      mockDbWithConversation({ user_id: 'user-1', team_id: null, extra: '{}' }) as any
    );

    await expect(resolveUploadWorkspace('conv-123', undefined, baseUser)).rejects.toThrow(
      'Conversation workspace not found'
    );
  });

  it('throws workspace mismatch error when requested workspace differs', async () => {
    vi.mocked(getDatabase).mockResolvedValue(
      mockDbWithConversation({
        user_id: 'user-1',
        team_id: null,
        extra: JSON.stringify({ workspace: '/actual/workspace' }),
      }) as any
    );

    await expect(resolveUploadWorkspace('conv-123', '/different/workspace', baseUser)).rejects.toThrow(
      'Workspace mismatch'
    );
  });

  it('returns conversation workspace when no requested workspace', async () => {
    vi.mocked(getDatabase).mockResolvedValue(
      mockDbWithConversation({
        user_id: 'user-1',
        team_id: null,
        extra: JSON.stringify({ workspace: '/actual/workspace' }),
      }) as any
    );

    const result = await resolveUploadWorkspace('conv-123', undefined, baseUser);
    expect(result).toBe(path.resolve('/actual/workspace'));
  });

  it('returns resolved path when requested workspace matches conversation workspace', async () => {
    const workspace = '/home/user/workspace';
    vi.mocked(getDatabase).mockResolvedValue(
      mockDbWithConversation({
        user_id: 'user-1',
        team_id: null,
        extra: JSON.stringify({ workspace }),
      }) as any
    );

    const result = await resolveUploadWorkspace('conv-123', workspace, baseUser);
    expect(result).toBe(path.resolve(workspace));
  });

  it('handles relative paths in workspace', async () => {
    vi.mocked(getDatabase).mockResolvedValue(
      mockDbWithConversation({
        user_id: 'user-1',
        team_id: null,
        extra: JSON.stringify({ workspace: './relative/path' }),
      }) as any
    );

    const result = await resolveUploadWorkspace('conv-123', undefined, baseUser);
    expect(result).toBe(path.resolve('./relative/path'));
  });

  it('handles absolute paths in workspace', async () => {
    vi.mocked(getDatabase).mockResolvedValue(
      mockDbWithConversation({
        user_id: 'user-1',
        team_id: null,
        extra: JSON.stringify({ workspace: '/absolute/path/to/workspace' }),
      }) as any
    );

    const result = await resolveUploadWorkspace('conv-123', undefined, baseUser);
    expect(result).toBe(path.resolve('/absolute/path/to/workspace'));
  });

  it('calls getConversation with the conversationId', async () => {
    const mockDb = mockDbWithConversation({
      user_id: 'user-1',
      team_id: null,
      extra: JSON.stringify({ workspace: '/workspace' }),
    });
    vi.mocked(getDatabase).mockResolvedValue(mockDb as any);

    await resolveUploadWorkspace('test-conv-id', undefined, baseUser);

    const driver = mockDb.getDriver();
    const firstPrepare = (driver.prepare as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(firstPrepare?.get).toHaveBeenCalledWith('default', 'test-conv-id');
  });
});
