import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_DELIVERABLE_AGENT_NAME,
  DOCUMENT_DELIVERABLE_CRON_PROMPT,
  DOCUMENT_DELIVERABLE_INSTRUCTIONS,
  DOCUMENT_DELIVERABLE_SKILL_IDS,
  LARK_DOC_DELIVERABLE_SKILL_NAME,
} from '@/common/digitalEmployee/presets/documentDeliverable';
import { buildPersonalDigitalEmployeeCronPrompt } from '@/common/digitalEmployee/runPrompt';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';

describe('document deliverable preset', () => {
  it('requires local html+docx and treats feishu as optional fallback', () => {
    expect(DOCUMENT_DELIVERABLE_INSTRUCTIONS).toContain('report.html');
    expect(DOCUMENT_DELIVERABLE_INSTRUCTIONS).toContain('report.docx');
    expect(DOCUMENT_DELIVERABLE_INSTRUCTIONS).toContain('officecli');
    expect(DOCUMENT_DELIVERABLE_INSTRUCTIONS).toContain('不要中断任务');
    expect(DOCUMENT_DELIVERABLE_CRON_PROMPT).toContain('飞书不可用时只交付本地双格式');
  });

  it('binds lark-doc-deliverable skill id', () => {
    expect(LARK_DOC_DELIVERABLE_SKILL_NAME).toBe('lark-doc-deliverable');
    expect(DOCUMENT_DELIVERABLE_SKILL_IDS).toEqual(['local:lark-doc-deliverable']);
  });

  it('uses document cron prompt for 文档产出专员', () => {
    const agent = {
      id: 'a1',
      ownerUserId: 'u1',
      tenantId: 'default',
      name: DOCUMENT_DELIVERABLE_AGENT_NAME,
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: {},
      createdAt: 1,
      updatedAt: 1,
    } satisfies PersonalAgent;
    expect(buildPersonalDigitalEmployeeCronPrompt(agent)).toBe(DOCUMENT_DELIVERABLE_CRON_PROMPT);
  });
});
