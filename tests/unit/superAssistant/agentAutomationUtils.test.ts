import { describe, expect, it } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { isAgentCronJob, listAgentCronJobs } from '@/renderer/pages/superAssistant/utils/agentAutomationUtils';

function makeJob(overrides: Partial<ICronJob> = {}): ICronJob {
  return {
    id: 'job-1',
    name: 'Test',
    description: '',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 9 * * *', description: 'daily' },
    target: { kind: 'message', payload: { kind: 'message', text: 'run' }, executionMode: 'new_conversation' },
    metadata: {
      createdAt: 1,
      updatedAt: 1,
      createdBy: 'user',
      agentType: 'acp',
      agentConfig: {
        backend: 'acp',
        name: 'Agent',
        autopilotContext: {
          teamId: 'personal',
          agentSlotId: 'pa-1',
          personalAgentId: 'pa-1',
          ownerUserId: 'user-1',
        },
      },
    },
    ...overrides,
  } as ICronJob;
}

describe('agentAutomationUtils personal digital employee', () => {
  it('matches cron jobs for personal teamId and slot', () => {
    const job = makeJob();
    expect(isAgentCronJob(job, 'personal', 'pa-1')).toBe(true);
    expect(isAgentCronJob(job, 'personal', 'other')).toBe(false);
    expect(isAgentCronJob(job, 'team-1', 'pa-1')).toBe(false);
  });

  it('lists jobs under personal:slot key used by AgentsTab', () => {
    const jobs = [makeJob(), makeJob({ id: 'job-2', metadata: { ...makeJob().metadata, agentConfig: undefined } })];
    expect(listAgentCronJobs(jobs, 'personal', 'pa-1')).toHaveLength(1);
  });
});
