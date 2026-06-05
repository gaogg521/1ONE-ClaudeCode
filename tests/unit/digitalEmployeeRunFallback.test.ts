import { describe, expect, it } from 'vitest';
import {
  buildDigitalEmployeePresetBundle,
  DIGITAL_EMPLOYEE_DOCUMENT_DELIVERY_HINT,
  DIGITAL_EMPLOYEE_GLOBAL_MCP_HINT,
  DIGITAL_EMPLOYEE_UNBOUND_SKILLS_HINT,
} from '@/common/digitalEmployee/runFallback';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import { mapPersonalAgentToPreset } from '@process/digitalEmployee/resolvePersonalAgentPreset';

function makeAgent(overrides: Partial<PersonalAgent> = {}): PersonalAgent {
  return {
    id: 'agent-1',
    ownerUserId: 'user-1',
    tenantId: 'default',
    name: '测试员工',
    agentType: 'claude',
    conversationType: 'acp',
    automationConfig: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('digitalEmployee run fallback', () => {
  it('injects baseline hints when no skills or custom instructions are bound', () => {
    const bundle = buildDigitalEmployeePresetBundle(makeAgent());
    expect(bundle.hasBoundSkills).toBe(false);
    expect(bundle.hasCustomInstructions).toBe(false);
    expect(bundle.presetContext).toContain('测试员工');
    expect(bundle.presetContext).toContain(DIGITAL_EMPLOYEE_UNBOUND_SKILLS_HINT);
    expect(bundle.presetContext).toContain(DIGITAL_EMPLOYEE_DOCUMENT_DELIVERY_HINT);
    expect(bundle.presetContext).toContain(DIGITAL_EMPLOYEE_GLOBAL_MCP_HINT);
    expect(bundle.enabledSkills).toBeUndefined();
  });

  it('passes enabledSkills only when skillIds are configured', () => {
    const bundle = buildDigitalEmployeePresetBundle(
      makeAgent({ automationConfig: { skillIds: ['novel-writer'], instructions: '自定义指令' } })
    );
    expect(bundle.enabledSkills).toEqual(['novel-writer']);
    expect(bundle.hasBoundSkills).toBe(true);
    expect(bundle.hasCustomInstructions).toBe(true);
    expect(bundle.presetContext).not.toContain(DIGITAL_EMPLOYEE_UNBOUND_SKILLS_HINT);
    expect(bundle.presetContext).toContain(DIGITAL_EMPLOYEE_GLOBAL_MCP_HINT);
  });

  it('mapPersonalAgentToPreset aligns with bundle for process-side injection', () => {
    const preset = mapPersonalAgentToPreset(
      makeAgent({ automationConfig: { instructions: '只做安全巡检' } })
    );
    expect(preset.presetContext).toContain('只做安全巡检');
    expect(preset.presetContext).toContain(DIGITAL_EMPLOYEE_GLOBAL_MCP_HINT);
  });
});
