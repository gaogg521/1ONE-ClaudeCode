import { describe, expect, it } from 'vitest';
import { buildDigitalEmployeePresetContext } from '@/common/digitalEmployee/presetContext';
import { prepareFirstMessage } from '@process/task/agentUtils';

const SECURITY_EXPERT_INSTRUCTIONS = `你是信息安全专家，主攻游戏方向的信息安全漏洞与情报搜集。
关注：游戏客户端反作弊、私服漏洞、账号体系、支付链路、外挂样本与 CVE 情报。
输出要求：结构化 Markdown，区分「漏洞假设 / 情报来源 / 验证步骤 / 风险等级」。`;

describe('digital employee preset context', () => {
  it('builds role instructions for a game security expert', () => {
    const preset = buildDigitalEmployeePresetContext({
      name: '游戏安全情报官',
      description: '7×24 跟进游戏行业安全动态',
      instructions: SECURITY_EXPERT_INSTRUCTIONS,
    });
    expect(preset).toContain('游戏安全情报官');
    expect(preset).toContain('信息安全专家');
    expect(preset).toContain('游戏方向');
    expect(preset).toContain('情报搜集');
  });

  it('injects preset into first message for ACP agents', async () => {
    const preset = buildDigitalEmployeePresetContext({
      name: '游戏安全情报官',
      instructions: SECURITY_EXPERT_INSTRUCTIONS,
    });
    const wrapped = await prepareFirstMessage('请汇总本周手游赛道高危漏洞。', {
      presetContext: preset,
    });
    expect(wrapped).toContain('[Assistant Rules');
    expect(wrapped).toContain('游戏方向');
    expect(wrapped).toContain('请汇总本周手游赛道高危漏洞');
  });
});
