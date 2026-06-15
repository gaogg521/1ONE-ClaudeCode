/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AGENT_BLOCKER_ESCALATION_INSTRUCTIONS } from '@/common/types/agentEscalationInstructions';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import type { TeamAgent } from '@/common/types/teamTypes';
import {
  DOCUMENT_DELIVERABLE_AGENT_NAME,
  DOCUMENT_DELIVERABLE_CRON_PROMPT,
} from '@/common/digitalEmployee/presets/documentDeliverable';
import {
  GAME_SECURITY_DAILY_CRON_PROMPT,
  GAME_SECURITY_EXPERT_NAME,
} from '@/common/digitalEmployee/presets/gameSecurityDailyReport';

export function buildIssueAssignmentPrompt(
  issue: { id: string; subject: string; description?: string | null },
  agentName: string
): string {
  const description = issue.description?.trim();
  return [
    `你是「${agentName}」，请立即开始处理以下 Issue：`,
    '',
    `**${issue.subject}**`,
    `Issue ID: \`${issue.id}\``,
    description ? description : '',
    '',
    '要求：',
    '1. 直接开始执行，不要反问澄清问题',
    '2. 遇到阻塞请说明原因，并在回复中用 @用户名 提及需要介入的同事',
    '3. 完成后输出可交付摘要；若职责包含文档产出，写明本地 report.html 与 report.docx 路径，飞书成功时再附链接',
    '',
    AGENT_BLOCKER_ESCALATION_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPersonalDigitalEmployeeCronPrompt(
  agent: PersonalAgent,
  issue?: { id: string; subject: string; description?: string | null } | null
): string {
  if (issue) {
    return buildIssueAssignmentPrompt(issue, agent.name);
  }
  if (agent.name.trim() === GAME_SECURITY_EXPERT_NAME) {
    return GAME_SECURITY_DAILY_CRON_PROMPT;
  }
  if (agent.name.trim() === DOCUMENT_DELIVERABLE_AGENT_NAME) {
    return DOCUMENT_DELIVERABLE_CRON_PROMPT;
  }
  const instructions =
    typeof agent.automationConfig?.instructions === 'string' ? agent.automationConfig.instructions.trim() : '';
  if (instructions) {
    return [
      `你是数字员工「${agent.name}」。`,
      instructions,
      '请按本定时任务执行一轮巡检：汇总待处理事项、阻塞与建议下一步，输出简洁 Markdown。',
    ].join('\n\n');
  }
  return [
    `你是数字员工「${agent.name}」。`,
    '请扫描你负责范围内的未完成事项与阻塞，输出 Markdown 摘要；需要同事介入时用 @用户名 提及。',
    AGENT_BLOCKER_ESCALATION_INSTRUCTIONS,
  ].join('\n\n');
}

/** Patrol / duty prompt for workspace (team) digital employees. */
export function buildTeamDigitalEmployeeRunPrompt(
  agent: TeamAgent,
  issue?: { id: string; subject: string; description?: string | null } | null
): string {
  if (issue) {
    return buildIssueAssignmentPrompt(issue, agent.agentName);
  }
  return [
    `你是数字员工「${agent.agentName}」。`,
    '请立即执行一轮团队 Issue 巡检：汇总未完成项、阻塞与建议下一步，输出 Markdown 摘要；需要同事介入时用 @用户名 提及。',
    AGENT_BLOCKER_ESCALATION_INSTRUCTIONS,
  ].join('\n\n');
}
