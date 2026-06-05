import { describe, expect, it } from 'vitest';
import {
  buildAutopilotForPersonalAgent,
  buildPersonalDigitalEmployeeCronPrompt,
} from '@/renderer/pages/superAssistant/utils/autopilotDefaults';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';

const personalAgent: PersonalAgent = {
  id: 'pa-1',
  ownerUserId: 'user-1',
  tenantId: 'default',
  name: '游戏行业安全工程师',
  agentType: 'claude',
  conversationType: 'acp',
  customAgentId: 'preset-sec',
  automationConfig: {
    instructions: '主攻游戏漏洞与情报搜集',
    skillIds: ['skill-a'],
    preferredModelId: 'model-x',
  },
  createdAt: 1,
  updatedAt: 1,
};

describe('buildAutopilotForPersonalAgent', () => {
  it('binds cron to personal teamId and personalAgentId', () => {
    const defaults = buildAutopilotForPersonalAgent(personalAgent, { requirementId: 'req-1' });
    expect(defaults?.initialAgentKey).toBe('preset:preset-sec');
    expect(defaults?.autopilotContext).toMatchObject({
      teamId: 'personal',
      agentSlotId: 'pa-1',
      personalAgentId: 'pa-1',
      ownerUserId: 'user-1',
      requirementId: 'req-1',
      postBackToIssue: true,
    });
  });

  it('uses digital employee instructions in cron prompt', () => {
    const prompt = buildPersonalDigitalEmployeeCronPrompt(personalAgent, null);
    expect(prompt).toContain('游戏行业安全工程师');
    expect(prompt).toContain('主攻游戏漏洞与情报搜集');
  });
});
