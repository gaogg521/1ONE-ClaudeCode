import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutopilotContext } from '@/common/types/autopilotContext';

const { personalFindById, personalUpdate, teamFindById, teamUpdate } = vi.hoisted(() => ({
  personalFindById: vi.fn(),
  personalUpdate: vi.fn(),
  teamFindById: vi.fn(),
  teamUpdate: vi.fn(),
}));

vi.mock('@process/agent/personalAgentRepository', () => ({
  SqlitePersonalAgentRepository: class {
    findById = personalFindById;
    update = personalUpdate;
  },
}));

vi.mock('@process/team/repository/SqliteTeamRepository', () => ({
  SqliteTeamRepository: class {
    findById = teamFindById;
    update = teamUpdate;
  },
}));

import {
  recordDigitalEmployeeCronRunFinished,
  recordDigitalEmployeeCronRunStarted,
} from '@process/digitalEmployee/digitalEmployeeCronRun';

describe('digitalEmployeeCronRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records personal cron run start', async () => {
    personalFindById.mockResolvedValue({
      id: 'agent-1',
      automationConfig: {},
    });
    const autopilot: AutopilotContext = {
      source: 'super_assistant',
      teamId: 'personal',
      agentSlotId: 'agent-1',
      personalAgentId: 'agent-1',
      ownerUserId: 'user-1',
    };
    await recordDigitalEmployeeCronRunStarted(autopilot, 'conv-1');
    expect(personalUpdate).toHaveBeenCalledOnce();
    const payload = personalUpdate.mock.calls[0]?.[1] as {
      automationConfig: { lastRun: { status: string; conversationId: string } };
    };
    expect(payload.automationConfig.lastRun.status).toBe('running');
    expect(payload.automationConfig.lastRun.conversationId).toBe('conv-1');
  });

  it('records team cron run finish', async () => {
    teamFindById.mockResolvedValue({
      id: 'team-1',
      agents: [
        {
          slotId: 'slot-1',
          lastRun: {
            runId: 'r1',
            conversationId: 'conv-team',
            startedAt: 1,
            status: 'running',
          },
        },
      ],
    });
    const autopilot: AutopilotContext = {
      source: 'super_assistant',
      teamId: 'team-1',
      agentSlotId: 'slot-1',
    };
    await recordDigitalEmployeeCronRunFinished(autopilot, 'conv-team', {
      status: 'success',
      summary: 'ok',
    });
    expect(teamUpdate).toHaveBeenCalledOnce();
    const payload = teamUpdate.mock.calls[0]?.[1] as {
      agents: Array<{ lastRun?: { status: string; summary?: string } }>;
    };
    expect(payload.agents[0]?.lastRun?.status).toBe('success');
    expect(payload.agents[0]?.lastRun?.summary).toBe('ok');
  });
});
