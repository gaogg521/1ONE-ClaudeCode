import { beforeEach, describe, expect, it, vi } from 'vitest';

const listJobsMock = vi.hoisted(() => vi.fn());
const removeJobMock = vi.hoisted(() => vi.fn());
const personalRemoveMock = vi.hoisted(() => vi.fn());
const teamRemoveAgentMock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobs: { invoke: listJobsMock },
      removeJob: { invoke: removeJobMock },
    },
    personalAgent: {
      remove: { invoke: personalRemoveMock },
    },
    team: {
      removeAgent: { invoke: teamRemoveAgentMock },
    },
  },
}));

import {
  deletePersonalDigitalEmployee,
  deleteTeamDigitalEmployee,
  removeCronJobsForDigitalEmployee,
} from '@/renderer/pages/superAssistant/utils/deleteDigitalEmployee';

describe('deleteDigitalEmployee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listJobsMock.mockResolvedValue([
      {
        id: 'job-1',
        metadata: {
          agentConfig: {
            autopilotContext: { teamId: 'personal', agentSlotId: 'agent-a' },
          },
        },
      },
      {
        id: 'job-2',
        metadata: {
          agentConfig: {
            autopilotContext: { teamId: 'team-1', agentSlotId: 'slot-b' },
          },
        },
      },
    ]);
    removeJobMock.mockResolvedValue(undefined);
    personalRemoveMock.mockResolvedValue(undefined);
    teamRemoveAgentMock.mockResolvedValue(undefined);
  });

  it('removes linked cron jobs before deleting a personal agent', async () => {
    const result = await deletePersonalDigitalEmployee({ id: 'agent-a', ownerUserId: 'user-1' });
    expect(result.removedCronJobs).toBe(1);
    expect(removeJobMock).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(personalRemoveMock).toHaveBeenCalledWith({ id: 'agent-a', ownerUserId: 'user-1' });
  });

  it('removes team agent and its cron jobs', async () => {
    const result = await deleteTeamDigitalEmployee({
      teamId: 'team-1',
      tenantId: 'tenant-1',
      slotId: 'slot-b',
    });
    expect(result.removedCronJobs).toBe(1);
    expect(teamRemoveAgentMock).toHaveBeenCalledWith({
      teamId: 'team-1',
      tenantId: 'tenant-1',
      slotId: 'slot-b',
    });
  });

  it('removeCronJobsForDigitalEmployee returns zero when none match', async () => {
    const count = await removeCronJobsForDigitalEmployee('team-x', 'slot-x');
    expect(count).toBe(0);
    expect(removeJobMock).not.toHaveBeenCalled();
  });
});
