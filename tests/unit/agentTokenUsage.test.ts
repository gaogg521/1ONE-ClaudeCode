import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import { aggregateAgentTokenUsageForTenant } from '@process/services/usage/agentTokenUsage';

let nativeModuleAvailable = true;
try {
  const driver = new BetterSqlite3Driver(':memory:');
  driver.close();
} catch (error) {
  if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

describeOrSkip('aggregateAgentTokenUsageForTenant', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 100);
    const now = Date.now();
    driver
      .prepare(
        `INSERT INTO conversations (id, tenant_id, team_id, user_id, name, type, extra, model, status, source, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 'acp', ?, '{}', 'idle', '1one', ?, ?)`
      )
      .run(
        'conv-1',
        'tenant-a',
        'user-1',
        '游戏安全专家 · 巡检',
        JSON.stringify({
          personalAgentId: 'agent-sec',
          agentName: '游戏安全专家',
          lastTokenUsage: { totalTokens: 12000 },
        }),
        now,
        now
      );
    driver
      .prepare(
        `INSERT INTO personal_agents (id, owner_user_id, tenant_id, name, description, agent_type, conversation_type, automation_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'claude', 'acp', '{}', ?, ?)`
      )
      .run('agent-sec', 'user-1', 'tenant-a', '游戏安全专家', now, now);
  });

  afterEach(() => {
    driver.close();
  });

  it('aggregates tokens by personal agent id', async () => {
    const rows = await aggregateAgentTokenUsageForTenant('tenant-a', {
      sinceMs: Date.now() - 86_400_000,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.agentName).toBe('游戏安全专家');
    expect(rows[0]?.totalTokens).toBe(12000);
    expect(rows[0]?.source).toBe('personal');
  });
});
