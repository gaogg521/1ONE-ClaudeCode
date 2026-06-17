/**
 * @license
 * Copyright 2025 1ONE ClaudeCode (1one-claudecode.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase } from '@process/services/database';

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: vi.fn(() => ({
    cacheDir: '/tmp/aion-cache',
  })),
}));

import { resolveUploadWorkspace } from '@process/webserver/routes/apiRoutes';

describe('resolveUploadWorkspace', () => {
  const baseUser = { id: 'user-1', tenant_id: 'default', role: 'member' as const };

  const prepare = vi.fn();

  function setConversationRow(row: { user_id: string; team_id: string | null; extra: string } | undefined) {
    prepare.mockImplementation((sql: string) => ({
      get: vi.fn((..._args: unknown[]) => {
        if (sql.includes('FROM conversations')) return row;
        if (sql.includes('FROM team_memberships')) return undefined;
        return undefined;
      }),
    }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDatabase).mockResolvedValue({
      getDriver: vi.fn(() => ({ prepare })),
    } as never);
  });

  it('returns the stored conversation workspace when requested workspace matches', async () => {
    setConversationRow({
      user_id: 'user-1',
      team_id: null,
      extra: JSON.stringify({
        workspace: '/tmp/aion/workspace-1',
      }),
    });

    const resolved = await resolveUploadWorkspace('conv-1', '/tmp/aion/workspace-1', baseUser);

    expect(resolved).toBe(path.resolve('/tmp/aion/workspace-1'));
  });

  it('allows uploads without a requested workspace and still uses the stored conversation workspace', async () => {
    setConversationRow({
      user_id: 'user-1',
      team_id: null,
      extra: JSON.stringify({
        workspace: '/tmp/aion/workspace-2',
      }),
    });

    await expect(resolveUploadWorkspace('conv-2', undefined, baseUser)).resolves.toBe(
      path.resolve('/tmp/aion/workspace-2')
    );
  });

  it('rejects uploads when the requested workspace does not match the conversation workspace', async () => {
    setConversationRow({
      user_id: 'user-1',
      team_id: null,
      extra: JSON.stringify({
        workspace: '/tmp/aion/workspace-3',
      }),
    });

    await expect(resolveUploadWorkspace('conv-3', '/tmp/aion/other-workspace', baseUser)).rejects.toThrow(
      'Workspace mismatch'
    );
  });

  it('rejects uploads when the conversation has no workspace', async () => {
    setConversationRow({
      user_id: 'user-1',
      team_id: null,
      extra: JSON.stringify({}),
    });

    await expect(resolveUploadWorkspace('conv-4', undefined, baseUser)).rejects.toThrow(
      'Conversation workspace not found'
    );
  });
});
