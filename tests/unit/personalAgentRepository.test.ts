import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';

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

function makeAgent(overrides: Partial<PersonalAgent> = {}): PersonalAgent {
  return {
    id: 'personal-agent-1',
    ownerUserId: 'user-1',
    tenantId: 'default',
    name: 'Personal Claude',
    description: 'Local personal assistant',
    agentType: 'acp',
    conversationType: 'acp',
    customAgentId: 'claude-code',
    cliPath: undefined,
    automationConfig: {
      enabled: true,
      trigger: 'manual',
    },
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describeOrSkip('SqlitePersonalAgentRepository', () => {
  let driver: BetterSqlite3Driver;
  let repo: SqlitePersonalAgentRepository;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 100);
    repo = new SqlitePersonalAgentRepository(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('creates and retrieves a personal agent', async () => {
    const agent = makeAgent();
    await repo.create(agent);

    const found = await repo.findById('personal-agent-1');

    expect(found).toMatchObject({
      id: 'personal-agent-1',
      ownerUserId: 'user-1',
      name: 'Personal Claude',
      automationConfig: { enabled: true, trigger: 'manual' },
    });
  });

  it('lists agents only for the requested owner', async () => {
    await repo.create(makeAgent({ id: 'agent-1', ownerUserId: 'user-1', updatedAt: 1000 }));
    await repo.create(makeAgent({ id: 'agent-2', ownerUserId: 'user-2', updatedAt: 2000 }));
    await repo.create(makeAgent({ id: 'agent-3', ownerUserId: 'user-1', updatedAt: 3000 }));

    const list = await repo.findAllByOwner('user-1');

    expect(list.map((agent) => agent.id)).toEqual(['agent-3', 'agent-1']);
  });

  it('does not read or update another owner personal agent when owner is provided', async () => {
    await repo.create(makeAgent({ id: 'agent-1', ownerUserId: 'user-1' }));

    await expect(repo.findById('agent-1', 'user-2')).resolves.toBeNull();
    await expect(repo.update('agent-1', { name: 'Cross Owner Rename' }, 'user-2')).rejects.toThrow(
      'Personal agent "agent-1" not found'
    );
    await expect(repo.findById('agent-1', 'user-1')).resolves.toMatchObject({
      name: 'Personal Claude',
    });
  });

  it('updates automation config without moving the agent into teams', async () => {
    await repo.create(makeAgent());

    const updated = await repo.update('personal-agent-1', {
      automationConfig: { enabled: false, trigger: 'schedule' },
      updatedAt: 2000,
    });

    expect(updated.automationConfig).toEqual({ enabled: false, trigger: 'schedule' });
    expect(updated.updatedAt).toBe(2000);
    const teams = driver.prepare('SELECT * FROM teams').all();
    expect(teams).toEqual([]);
  });

  it('deletes a personal agent', async () => {
    await repo.create(makeAgent());

    await repo.delete('personal-agent-1');

    expect(await repo.findById('personal-agent-1')).toBeNull();
  });

  it('does not delete another owner personal agent when owner is provided', async () => {
    await repo.create(makeAgent({ id: 'agent-1', ownerUserId: 'user-1' }));

    await repo.delete('agent-1', 'user-2');

    expect(await repo.findById('agent-1', 'user-1')).not.toBeNull();
  });
});
