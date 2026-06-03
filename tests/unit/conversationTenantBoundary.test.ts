import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OneCmdDatabase } from '@process/services/database';
import { conversationToRow } from '@process/services/database/types';
import type { TChatConversation } from '@/common/config/storage';

let nativeModuleAvailable = true;
try {
  const { BetterSqlite3Driver } = await import('@process/services/database/drivers/BetterSqlite3Driver');
  const driver = new BetterSqlite3Driver(':memory:');
  driver.close();
} catch (error) {
  if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  } else {
    throw error;
  }
}

const describeIfNative = nativeModuleAvailable ? describe : describe.skip;

describe('conversation row tenant mapping', () => {
  it('derives tenant_id and team_id from conversation extra', () => {
    const conversation = {
      id: 'conv-row-enterprise-team',
      name: 'Enterprise Team Agent',
      type: 'acp',
      createTime: 1,
      modifyTime: 2,
      status: 'pending',
      source: '1one',
      model: { provider: 'test', model: 'mock' },
      extra: {
        workspace: 'D:/workspace',
        backend: 'codex',
        teamId: 'team-enterprise',
        tenantId: 'tenant-enterprise',
      },
    } as TChatConversation;

    expect(conversationToRow(conversation, 'user-enterprise')).toMatchObject({
      id: 'conv-row-enterprise-team',
      tenant_id: 'tenant-enterprise',
      team_id: 'team-enterprise',
      user_id: 'user-enterprise',
    });
  });
});

describeIfNative('conversation tenant boundary', () => {
  let tempDir: string;
  let db: OneCmdDatabase;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'one-conversation-tenant-'));
    db = await OneCmdDatabase.create(path.join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists team conversations under their enterprise tenant', () => {
    const conversation = {
      id: 'conv-enterprise-team',
      name: 'Enterprise Team Agent',
      type: 'acp',
      createTime: 1,
      modifyTime: 2,
      status: 'pending',
      source: '1one',
      model: { provider: 'test', model: 'mock' },
      extra: {
        workspace: 'D:/workspace',
        backend: 'codex',
        teamId: 'team-enterprise',
        tenantId: 'tenant-enterprise',
      },
    } as TChatConversation;

    const result = db.createConversation(conversation, 'user-enterprise');

    expect(result.success).toBe(true);
    const rows = db
      .getDriver()
      .prepare('SELECT tenant_id, team_id FROM conversations WHERE id = ?')
      .all('conv-enterprise-team') as Array<{ tenant_id: string; team_id: string | null }>;
    expect(rows).toEqual([{ tenant_id: 'tenant-enterprise', team_id: 'team-enterprise' }]);
  });
});
