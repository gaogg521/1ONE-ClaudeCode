import { describe, expect, it } from 'vitest';
import {
  buildIssueAssignmentPrompt,
  buildSuperAssistantAutopilotDefaults,
  resolveTeamAgentCronKey,
} from '@/renderer/pages/superAssistant/utils/autopilotDefaults';

describe('superAssistant autopilotDefaults', () => {
  it('resolveTeamAgentCronKey prefers preset custom agent id', () => {
    expect(
      resolveTeamAgentCronKey({
        slotId: 'dev',
        conversationId: 'conv-1',
        role: 'teammate',
        agentType: 'claude',
        agentName: 'Dev Agent',
        conversationType: 'acp',
        status: 'idle',
        customAgentId: 'preset-1',
      })
    ).toBe('preset:preset-1');
  });

  it('buildSuperAssistantAutopilotDefaults binds team, issue, and skills', () => {
    const defaults = buildSuperAssistantAutopilotDefaults({
      teamId: 'team-1',
      leadAgent: {
        slotId: 'leader',
        conversationId: 'conv-1',
        role: 'lead',
        agentType: 'claude',
        agentName: 'Leader',
        conversationType: 'acp',
        status: 'idle',
      },
      requirementId: 'story-1',
      skillNames: ['PR Review', 'Deploy Bot'],
      mentionUserIds: ['user-1', 'user-2'],
    });

    expect(defaults?.initialAgentKey).toBe('cli:claude');
    expect(defaults?.autopilotContext.teamId).toBe('team-1');
    expect(defaults?.autopilotContext.requirementId).toBe('story-1');
    expect(defaults?.autopilotContext.postBackToIssue).toBe(true);
    expect(defaults?.autopilotContext.skillNames).toEqual(['PR Review', 'Deploy Bot']);
  });

  it('buildIssueAssignmentPrompt includes issue subject and execution rules', () => {
    const prompt = buildIssueAssignmentPrompt(
      { id: 'story-1', subject: '修复登录', description: 'LDAP 超时' },
      '开发 Agent'
    );
    expect(prompt).toContain('修复登录');
    expect(prompt).toContain('LDAP 超时');
    expect(prompt).toContain('开发 Agent');
    expect(prompt).toContain('story-1');
    expect(prompt).toContain('team_issue_escalate');
  });
});
