/**
 * Smoke-verify digital employee run services against a temp SQLite DB (bun runtime).
 * Run: bun scripts/verify-digital-employee-run.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { registerPlatformServices } = await import('../src/common/platform/index.ts');
const { NodePlatformServices } = await import('../src/common/platform/NodePlatformServices.ts');
registerPlatformServices(new NodePlatformServices());

const { closeDatabase, getDatabase, __testOnlySetDatabasePath } = await import(
  '../src/process/services/database/index.ts'
);
const { SqlitePersonalAgentRepository } = await import('../src/process/agent/personalAgentRepository.ts');
const { SqliteTeamRepository } = await import('../src/process/team/repository/SqliteTeamRepository.ts');
const { DigitalEmployeeRunService } = await import('../src/process/digitalEmployee/DigitalEmployeeRunService.ts');
const { TeamDigitalEmployeeRunService } = await import(
  '../src/process/digitalEmployee/TeamDigitalEmployeeRunService.ts'
);
const { recordDigitalEmployeeCronRunFinished, recordDigitalEmployeeCronRunStarted } = await import(
  '../src/process/digitalEmployee/digitalEmployeeCronRun.ts'
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '1one-verify-de-'));
__testOnlySetDatabasePath(path.join(tmpDir, 'verify.db'));
await getDatabase();

const personalRepo = new SqlitePersonalAgentRepository();
const personal = await personalRepo.create({
  ownerUserId: 'verify-user',
  tenantId: 'default',
  name: '验证员工',
  agentType: 'claude',
  conversationType: 'acp',
  automationConfig: { instructions: '验证巡检' },
});

const sendMessage = async () => {};
const taskManager = {
  getOrBuildTask: async () => ({ sendMessage, workspace: '' }),
};

const personalRun = new DigitalEmployeeRunService(taskManager, personalRepo);
const personalResult = await personalRun.runNow({
  agentId: personal.id,
  ownerUserId: 'verify-user',
});
const personalReloaded = await personalRepo.findById(personal.id, 'verify-user');
if (personalReloaded?.automationConfig?.lastRun?.status !== 'running') {
  throw new Error('personal lastRun not running');
}
console.log('[ok] personal runNow', personalResult.conversationId);

const db = (await getDatabase()).getDriver();
db.prepare(
  `INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at, updated_at)
   VALUES (?, ?, '', 'member', ?, ?)`
).run('verify-user', 'verify-user', Date.now(), Date.now());

const teamRepo = new SqliteTeamRepository();
await teamRepo.create({
  id: 'verify-team',
  tenantId: 'default',
  userId: 'verify-user',
  name: 'Verify Team',
  workspace: '',
  workspaceMode: 'shared',
  leadAgentId: 'dev',
  agents: [
    {
      slotId: 'dev',
      conversationId: 'conv-verify',
      role: 'teammate',
      agentType: 'claude',
      agentName: '团队验证',
      conversationType: 'acp',
      status: 'idle',
    },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const teamRun = new TeamDigitalEmployeeRunService(
  async () => ({
    sendMessageToAgent: async () => {},
  }),
  teamRepo
);
const teamResult = await teamRun.runNow({ teamId: 'verify-team', slotId: 'dev' });
const teamReloaded = await teamRepo.findById('verify-team');
const dev = teamReloaded?.agents.find((a) => a.slotId === 'dev');
if (dev?.lastRun?.status !== 'running') {
  throw new Error('team lastRun not running');
}
console.log('[ok] team runNow', teamResult.conversationId);

await recordDigitalEmployeeCronRunStarted(
  { source: 'super_assistant', teamId: 'personal', agentSlotId: personal.id, ownerUserId: 'verify-user' },
  'conv-cron-p'
);
await recordDigitalEmployeeCronRunFinished(
  { source: 'super_assistant', teamId: 'personal', agentSlotId: personal.id, ownerUserId: 'verify-user' },
  'conv-cron-p',
  { status: 'success', summary: 'cron ok' }
);
const afterCron = await personalRepo.findById(personal.id, 'verify-user');
if (afterCron?.automationConfig?.lastRun?.status !== 'success') {
  throw new Error('cron finish failed for personal');
}
console.log('[ok] cron persistence');

await closeDatabase();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  // Windows may keep the DB handle briefly after closeDatabase()
}
console.log('[done] digital employee run smoke passed');
