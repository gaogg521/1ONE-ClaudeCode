import { describe, expect, it, vi } from 'vitest';
import {
  buildEscalationMemberNotification,
  buildLeadEscalationInboxMessage,
  buildSuperAssistantIssueLink,
  notifyEnterpriseUsers,
  parseMentionUsernames,
} from '@process/services/devops/enterpriseNotificationService';

vi.mock('@process/services/devops/feishuImService', () => ({
  getFeishuTenantAccessToken: vi.fn(async () => null),
}));

vi.mock('@process/webserver/auth/smtpConfig', () => ({
  resolveSmtpConfig: vi.fn(async () => null),
}));

vi.mock('@process/webserver/auth/repository/AuthIdentityRepository', () => ({
  AuthIdentityRepository: {
    listForUsers: vi.fn(async () => []),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: async () => ({
    getDriver: () => ({
      prepare: () => ({
        all: vi.fn(() => [{ id: 'user-1', username: 'alice', email: 'alice@example.com' }]),
      }),
    }),
  }),
}));

const createUserNotificationMock = vi.fn(async (input: unknown) => ({
  ...(input as Record<string, unknown>),
  id: 'notification-1',
  read_at: null,
  created_at: Date.now(),
}));

vi.mock('@process/services/devops/userNotificationService', () => ({
  createUserNotification: (input: unknown) => createUserNotificationMock(input),
}));

describe('enterpriseNotificationService', () => {
  it('parseMentionUsernames extracts unique handles', () => {
    expect(parseMentionUsernames('请 @alice 和 @bob 跟进，再次 @alice')).toEqual(['alice', 'bob']);
    expect(parseMentionUsernames('负责人 @张三 请确认')).toEqual(['张三']);
  });

  it('buildEscalationMemberNotification includes task context', () => {
    const message = buildEscalationMemberNotification({
      agentName: '开发 Agent',
      subject: '补充埋点',
      requirementId: 'req-1',
      parentRequirementId: 'story-1',
      blockerReason: 'PostHog 无事件',
    });
    expect(message.title).toContain('开发 Agent');
    expect(message.body).toContain('补充埋点');
    expect(message.body).toContain('story-1');
  });

  it('buildLeadEscalationInboxMessage summarizes handoff', () => {
    const message = buildLeadEscalationInboxMessage({
      agentName: 'db-boy',
      subject: '补充埋点',
      requirementId: 'req-1',
      assignedMemberUsername: 'alice',
      assignedAgentName: 'frontend-agent',
    });
    expect(message).toContain('[Blocker Escalation]');
    expect(message).toContain('@alice');
    expect(message).toContain('frontend-agent');
  });

  it('buildSuperAssistantIssueLink encodes issue id', () => {
    expect(buildSuperAssistantIssueLink('req/1')).toBe('/super-assistant?issueId=req%2F1');
  });

  it('notifyEnterpriseUsers always writes in-app notification', async () => {
    createUserNotificationMock.mockClear();
    const results = await notifyEnterpriseUsers(
      'tenant-1',
      ['user-1'],
      { title: 'Hello', body: 'World' },
      { kind: 'task_assigned', linkPath: '/tasks' }
    );

    expect(createUserNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        kind: 'task_assigned',
        linkPath: '/tasks',
      })
    );
    expect(results.some((item) => item.channel === 'in_app' && item.ok)).toBe(true);
  });
});
