import { describe, expect, it } from 'vitest';
import {
  GAME_SECURITY_EXPERT_INSTRUCTIONS,
  GAME_SECURITY_EXPERT_NAME,
} from '@/common/digitalEmployee/presets/gameSecurityDailyReport';
import { buildDigitalEmployeePresetBundle } from '@/common/digitalEmployee/runFallback';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';

describe('game security daily report preset', () => {
  it('includes four report sections and defensive constraints', () => {
    expect(GAME_SECURITY_EXPERT_INSTRUCTIONS).toContain('不写外挂');
    expect(GAME_SECURITY_EXPERT_INSTRUCTIONS).toContain('当日风险汇总');
    expect(GAME_SECURITY_EXPERT_INSTRUCTIONS).toContain('外挂&黑产动态');
    expect(GAME_SECURITY_EXPERT_INSTRUCTIONS).toContain('次日整改建议');
  });

  it('builds injectable preset for 游戏安全专家', () => {
    const bundle = buildDigitalEmployeePresetBundle({
      id: 'a1',
      ownerUserId: 'u1',
      tenantId: 'default',
      name: GAME_SECURITY_EXPERT_NAME,
      description: '日报',
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: { instructions: GAME_SECURITY_EXPERT_INSTRUCTIONS },
      createdAt: 1,
      updatedAt: 1,
    } satisfies PersonalAgent);
    expect(bundle.presetContext).toContain(GAME_SECURITY_EXPERT_NAME);
    expect(bundle.presetContext).toContain('服务器/接口安全问题');
  });
});
