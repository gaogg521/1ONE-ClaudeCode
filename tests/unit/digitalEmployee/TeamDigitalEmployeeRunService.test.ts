import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamAgent } from '@/common/types/teamTypes';

const teamFindById = vi.fn();
const teamUpdate = vi.fn();
const sendMessageToAgent = vi.fn();
const onceIdle = vi.fn();
const getMessages = vi.fn();

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    onceIdle: (...args: unknown[]) => onceIdle(...args),
  },
}));

vi.mock('@process/services/database/SqliteConversationRepository', () => ({
  SqliteConversationRepository: vi.fn(() => ({
    getMessages,
  })),
}));

import { TeamDigitalEmployeeRunService } from '@process/digitalEmployee/TeamDigitalEmployeeRunService';

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-1',
    conversationId: 'conv-1',
    role: 'teammate',
    agentType: 'claude',
    agentName: 'Patrol Agent',
    conversationType: 'acp',
    status: 'idle',
    ...overrides,
  };
}

describe('TeamDigitalEmployeeRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageToAgent.mockResolvedValue(undefined);
    getMessages.mockResolvedValue({ data: [] });
  });

  it('starts a background run and sends duty prompt', async () => {
    teamFindById.mockResolvedValue({
      id: 'team-1',
      agents: [makeAgent()],
    });
    const service = new TeamDigitalEmployeeRunService(
      async () =>
        ({
          sendMessageToAgent,
        }) as never,
      { findById: teamFindById, update: teamUpdate } as never
    );

    const result = await service.runNow({
      teamId: 'team-1',
      slotId: 'slot-1',
    });

    expect(result.conversationId).toBe('conv-1');
    expect(teamUpdate).toHaveBeenCalled();
    expect(onceIdle).toHaveBeenCalledWith('conv-1', expect.any(Function));
    expect(sendMessageToAgent).toHaveBeenCalledWith(
      'slot-1',
      expect.stringContaining('Patrol Agent')
    );
  });

  it('throws when team agent is missing', async () => {
    teamFindById.mockResolvedValue({ id: 'team-1', agents: [] });
    const service = new TeamDigitalEmployeeRunService(
      async () =>
        ({
          sendMessageToAgent,
        }) as never,
      { findById: teamFindById, update: teamUpdate } as never
    );
    await expect(
      service.runNow({ teamId: 'team-1', slotId: 'missing' })
    ).rejects.toThrow(/not found/i);
  });
});
