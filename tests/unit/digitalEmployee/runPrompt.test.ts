import { describe, expect, it } from 'vitest';
import { buildPersonalDigitalEmployeeCronPrompt } from '@/common/digitalEmployee/runPrompt';
import {
  GAME_SECURITY_DAILY_CRON_PROMPT,
  GAME_SECURITY_EXPERT_NAME,
} from '@/common/digitalEmployee/presets/gameSecurityDailyReport';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import { buildTeamDigitalEmployeeRunPrompt } from '@/common/digitalEmployee/runPrompt';
import type { TeamAgent } from '@/common/types/teamTypes';
import { appendDigitalEmployeeRunHistory } from '@/common/types/digitalEmployeeRunTypes';

function stubAgent(overrides: Partial<PersonalAgent> = {}): PersonalAgent {
  return {
    id: 'agent-1',
    ownerUserId: 'user-1',
    tenantId: 'default',
    name: '测试员工',
    agentType: 'aionrs',
    conversationType: 'aionrs',
    automationConfig: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('buildPersonalDigitalEmployeeCronPrompt', () => {
  it('uses game security daily prompt for the preset name', () => {
    const prompt = buildPersonalDigitalEmployeeCronPrompt(
      stubAgent({ name: GAME_SECURITY_EXPERT_NAME })
    );
    expect(prompt).toBe(GAME_SECURITY_DAILY_CRON_PROMPT);
  });

  it('includes custom instructions when configured', () => {
    const prompt = buildPersonalDigitalEmployeeCronPrompt(
      stubAgent({
        automationConfig: { instructions: '每日输出风险摘要' },
      })
    );
    expect(prompt).toContain('每日输出风险摘要');
  });
});

describe('buildTeamDigitalEmployeeRunPrompt', () => {
  it('includes agent name in patrol prompt', () => {
    const prompt = buildTeamDigitalEmployeeRunPrompt({
      slotId: 's1',
      conversationId: 'c1',
      role: 'teammate',
      agentType: 'claude',
      agentName: '值班助手',
      conversationType: 'acp',
      status: 'idle',
    });
    expect(prompt).toContain('值班助手');
    expect(prompt).toContain('Issue 巡检');
  });
});

describe('appendDigitalEmployeeRunHistory', () => {
  it('prepends and caps history length', () => {
    const prior = Array.from({ length: 20 }, (_, index) => ({
      runId: `old-${index}`,
      conversationId: `conv-${index}`,
      startedAt: index,
      status: 'success' as const,
    }));
    const next = appendDigitalEmployeeRunHistory(prior, {
      runId: 'new',
      conversationId: 'conv-new',
      startedAt: 99,
      status: 'running',
    });
    expect(next[0]?.runId).toBe('new');
    expect(next).toHaveLength(20);
  });
});
