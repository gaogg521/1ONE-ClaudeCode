/**
 * Integration: personal + team digital employee background run persistence.
 * Run: bun run test -- tests/integration/digitalEmployeeRunFlow.bun.test.ts
 */

import { registerPlatformServices } from '@/common/platform';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';

registerPlatformServices(new NodePlatformServices());

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, __testOnlySetDatabasePath } from '@process/services/database';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import { SqliteTeamRepository } from '@process/team/repository/SqliteTeamRepository';
import { DigitalEmployeeRunService } from '@process/digitalEmployee/DigitalEmployeeRunService';
import { TeamDigitalEmployeeRunService } from '@process/digitalEmployee/TeamDigitalEmployeeRunService';
import {
  recordDigitalEmployeeCronRunFinished,
  recordDigitalEmployeeCronRunStarted,
} from '@process/digitalEmployee/digitalEmployeeCronRun';
import type { AutopilotContext } from '@/common/types/autopilotContext';
import type { TTeam } from '@/common/types/teamTypes';

function isBetterSqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    const probe = new BetterSqlite3(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!isBetterSqliteAvailable())('digital employee run flow (integration)', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '1one-de-run-'));
    __testOnlySetDatabasePath(path.join(tmpDir, 'test.db'));
    await getDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('personal runNow persists running state and returns conversation id', async () => {
    const personalRepo = new SqlitePersonalAgentRepository();
    const created = await personalRepo.create({
      ownerUserId: 'user-1',
      tenantId: 'default',
      name: '巡检员',
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: { instructions: '每日巡检' },
    });

    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const getOrBuildTask = vi.fn().mockResolvedValue({ sendMessage, workspace: '' });
    const taskManager = { getOrBuildTask } as never;

    const runService = new DigitalEmployeeRunService(taskManager, personalRepo);
    const result = await runService.runNow({
      agentId: created.id,
      ownerUserId: 'user-1',
    });

    expect(result.conversationId).toBeTruthy();
    expect(getOrBuildTask).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hidden: true,
        content: expect.stringContaining('巡检员'),
      })
    );

    const reloaded = await personalRepo.findById(created.id, 'user-1');
    expect(reloaded?.automationConfig?.lastRun?.status).toBe('running');
    expect(reloaded?.automationConfig?.lastRun?.conversationId).toBe(result.conversationId);
    expect(reloaded?.automationConfig?.runHistory?.[0]?.runId).toBe(reloaded?.automationConfig?.lastRun?.runId);
  });

  it('team runNow persists running state on team agent', async () => {
    const teamRepo = new SqliteTeamRepository();
    const team: TTeam = {
      id: 'team-1',
      tenantId: 'default',
      userId: 'user-1',
      name: 'Alpha',
      workspace: '',
      workspaceMode: 'shared',
      leadAgentId: 'lead',
      agents: [
        {
          slotId: 'dev',
          conversationId: 'conv-dev',
          role: 'teammate',
          agentType: 'claude',
          agentName: '开发 Agent',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await teamRepo.create(team);

    const sendMessageToAgent = vi.fn().mockResolvedValue(undefined);
    const runService = new TeamDigitalEmployeeRunService(async () => ({ sendMessageToAgent }) as never, teamRepo);

    const result = await runService.runNow({
      teamId: 'team-1',
      slotId: 'dev',
    });

    expect(result.conversationId).toBe('conv-dev');
    expect(sendMessageToAgent).toHaveBeenCalledWith('dev', expect.stringContaining('开发 Agent'));

    const reloaded = await teamRepo.findById('team-1');
    const agent = reloaded?.agents.find((item) => item.slotId === 'dev');
    expect(agent?.lastRun?.status).toBe('running');
    expect(agent?.runHistory?.[0]?.conversationId).toBe('conv-dev');
  });

  it('cron hooks update personal and team run records', async () => {
    const personalRepo = new SqlitePersonalAgentRepository();
    const personal = await personalRepo.create({
      ownerUserId: 'user-1',
      tenantId: 'default',
      name: '个人',
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: {},
    });

    const teamRepo = new SqliteTeamRepository();
    await teamRepo.create({
      id: 'team-cron',
      tenantId: 'default',
      userId: 'user-1',
      name: 'Cron Team',
      workspace: '',
      workspaceMode: 'shared',
      leadAgentId: 'slot-1',
      agents: [
        {
          slotId: 'slot-1',
          conversationId: 'conv-cron',
          role: 'teammate',
          agentType: 'claude',
          agentName: 'Cron Agent',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const personalAutopilot: AutopilotContext = {
      source: 'super_assistant',
      teamId: 'personal',
      agentSlotId: personal.id,
      personalAgentId: personal.id,
      ownerUserId: 'user-1',
    };
    await recordDigitalEmployeeCronRunStarted(personalAutopilot, 'conv-personal-cron');
    await recordDigitalEmployeeCronRunFinished(personalAutopilot, 'conv-personal-cron', {
      status: 'success',
      summary: '日报完成',
    });

    const personalReloaded = await personalRepo.findById(personal.id, 'user-1');
    expect(personalReloaded?.automationConfig?.lastRun?.status).toBe('success');
    expect(personalReloaded?.automationConfig?.lastRun?.summary).toBe('日报完成');

    const teamAutopilot: AutopilotContext = {
      source: 'super_assistant',
      teamId: 'team-cron',
      agentSlotId: 'slot-1',
    };
    await recordDigitalEmployeeCronRunStarted(teamAutopilot, 'conv-cron');
    await recordDigitalEmployeeCronRunFinished(teamAutopilot, 'conv-cron', {
      status: 'failed',
      error: 'timeout',
    });

    const teamReloaded = await teamRepo.findById('team-cron');
    const cronAgent = teamReloaded?.agents.find((item) => item.slotId === 'slot-1');
    expect(cronAgent?.lastRun?.status).toBe('failed');
    expect(cronAgent?.lastRun?.error).toBe('timeout');
  });
});
