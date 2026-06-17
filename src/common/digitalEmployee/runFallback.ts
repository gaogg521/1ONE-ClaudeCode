/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { DOCUMENT_DELIVERABLE_LOCAL_DUAL_FORMAT_STEPS } from '@/common/digitalEmployee/presets/documentDeliverable';
import { buildDigitalEmployeePresetContext } from '@/common/digitalEmployee/presetContext';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';

/** Shown when the employee has no bound Skills — builtin + global MCP still apply. */
export const DIGITAL_EMPLOYEE_UNBOUND_SKILLS_HINT = `【能力兜底 · Skills】
未单独绑定 Skills 时：仍注入应用内置基础 Skills 索引（如定时、文件与通用工作流）；需要专项流程时请在「管理数字员工 → Skills 能力包」中绑定。`;

/** Shown for all digital employees — MCP is not per-employee, uses global settings. */
export const DIGITAL_EMPLOYEE_GLOBAL_MCP_HINT = `【能力兜底 · MCP】
数字员工不单独配置 MCP：执行时沿用「设置 → MCP」中已启用的全局连接器；若无可用 MCP，请仅使用 Agent 内置工具与文本能力完成任务。`;

/** Guidance for local HTML+Word and optional Feishu docs (officecli + lark-cli). */
export const DIGITAL_EMPLOYEE_DOCUMENT_DELIVERY_HINT = `【文档交付 · 本地优先，飞书可选】
${DOCUMENT_DELIVERABLE_LOCAL_DUAL_FORMAT_STEPS}
- 飞书：本地双格式完成后，若 lark-cli 可用再 \`docs +create --from-md\`；失败则跳过，不阻塞本地交付。`;

/** Default operating rules when the user did not write custom instructions. */
export const DIGITAL_EMPLOYEE_DEFAULT_INSTRUCTIONS = `【默认工作方式】
1. 根据职责描述与当前 Issue/任务上下文直接执行，避免空泛复述。
2. 信息不足时列出假设、验证步骤与建议下一步（Markdown）。
3. 需要同事介入时用 @用户名 提及；遇到阻塞说明原因与依赖。
4. 任务要求产出报告/方案时，优先交付本地 HTML + Word；飞书为可选补充。`;

export type DigitalEmployeePresetBundle = {
  presetContext: string;
  enabledSkills?: string[];
  preferredModelId?: string;
  hasBoundSkills: boolean;
  hasCustomInstructions: boolean;
};

export function parsePersonalAgentSkillIds(agent: PersonalAgent): string[] {
  const raw = agent.automationConfig?.skillIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

export function buildDigitalEmployeePresetBundle(agent: PersonalAgent): DigitalEmployeePresetBundle {
  const skillIds = parsePersonalAgentSkillIds(agent);
  const instructions =
    typeof agent.automationConfig?.instructions === 'string' ? agent.automationConfig.instructions.trim() : '';
  const preferredModelId =
    typeof agent.automationConfig?.preferredModelId === 'string' ? agent.automationConfig.preferredModelId : undefined;

  const sections: string[] = [];
  const rolePreset = buildDigitalEmployeePresetContext({
    name: agent.name,
    description: agent.description,
    instructions: instructions || undefined,
  });
  if (rolePreset) {
    sections.push(rolePreset);
  }
  if (!instructions) {
    sections.push(DIGITAL_EMPLOYEE_DEFAULT_INSTRUCTIONS);
  }
  if (skillIds.length === 0) {
    sections.push(DIGITAL_EMPLOYEE_UNBOUND_SKILLS_HINT);
  }
  sections.push(DIGITAL_EMPLOYEE_DOCUMENT_DELIVERY_HINT);
  sections.push(DIGITAL_EMPLOYEE_GLOBAL_MCP_HINT);

  return {
    presetContext: sections.join('\n\n'),
    enabledSkills: skillIds.length > 0 ? skillIds : undefined,
    preferredModelId,
    hasBoundSkills: skillIds.length > 0,
    hasCustomInstructions: instructions.length > 0,
  };
}
