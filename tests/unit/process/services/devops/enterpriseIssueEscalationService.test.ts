import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockDriver = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    getDriver: () => mockDriver,
  })),
}));

import {
  listEnterpriseMembers,
  escalateEnterpriseIssue,
} from '@process/services/devops/enterpriseIssueEscalationService';

describe('enterpriseIssueEscalationService', () => {
  beforeEach(() => {
    mockDriver.prepare.mockReset();
  });

  it('listEnterpriseMembers prefers team_memberships rows', async () => {
    mockDriver.prepare.mockReturnValue({
      all: vi.fn(() => [
        { id: 'user-1', username: 'alice', role: 'member' },
        { id: 'user-2', username: 'bob', role: 'admin' },
      ]),
    });

    const members = await listEnterpriseMembers('team-1', 'tenant-1');
    expect(members).toHaveLength(2);
    expect(members[0]?.username).toBe('alice');
  });

  it('escalateEnterpriseIssue creates requirement and parent comment', async () => {
    const runMock = vi.fn();
    const getMock = vi
      .fn()
      .mockReturnValueOnce({ tenant_id: 'tenant-1', user_id: 'owner-1' })
      .mockReturnValueOnce(undefined);

    mockDriver.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM team_memberships')) {
        return { all: vi.fn(() => [{ id: 'user-2', username: 'bob', role: 'member' }]) };
      }
      if (sql.includes('SELECT tenant_id, user_id FROM teams')) {
        return { get: getMock };
      }
      if (sql.includes('INSERT INTO requirements')) {
        return { run: runMock };
      }
      if (sql.includes('INSERT INTO tasks')) {
        return { run: vi.fn() };
      }
      if (sql.includes('INSERT INTO requirement_comments')) {
        return { run: vi.fn() };
      }
      if (sql.includes('LOWER(u.username)')) {
        return { get: vi.fn(() => ({ id: 'user-2', username: 'bob' })) };
      }
      return { get: getMock, all: vi.fn(() => []), run: vi.fn() };
    });

    const createTeamTask = vi.fn(async () => ({ id: 'team-task-1' }));
    const wakeAgent = vi.fn(async () => undefined);

    const result = await escalateEnterpriseIssue(
      {
        teamId: 'team-1',
        agentSlotId: 'dev',
        agentName: '开发 Agent',
        subject: '补充 X 按钮埋点',
        blockerReason: 'PostHog 无对应事件',
        parentRequirementId: 'story-1',
        assignToMember: 'bob',
        assignToAgent: 'frontend-agent',
      },
      {
        resolveAgentSlotId: () => 'frontend',
        createTeamTask,
        wakeAgent,
      }
    );

    expect(result.requirementId).toBeTruthy();
    expect(result.assignedMemberUsername).toBe('bob');
    expect(result.assignedAgentSlotId).toBe('frontend');
    expect(createTeamTask).toHaveBeenCalled();
    expect(wakeAgent).toHaveBeenCalledWith('frontend');
    expect(runMock).toHaveBeenCalled();
  });
});
