/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AutopilotContext } from '@/common/types/autopilotContext';
import { AGENT_BLOCKER_ESCALATION_INSTRUCTIONS } from '@/common/types/agentEscalationInstructions';
import type { TeamAgent } from '@/common/types/teamTypes';

export type SuperAssistantAutopilotDefaults = {
  initialAgentKey?: string;
  autopilotContext: AutopilotContext;
};

export function resolveTeamAgentCronKey(agent: TeamAgent): string | undefined {
  if (agent.customAgentId) {
    return `preset:${agent.customAgentId}`;
  }
  const backend = agent.agentType || agent.conversationType;
  if (!backend) {
    return undefined;
  }
  return `cli:${backend}`;
}

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
    '3. 完成后输出可交付的 Markdown 摘要',
    '',
    AGENT_BLOCKER_ESCALATION_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildSuperAssistantAutopilotDefaults(input: {
  teamId?: string;
  leadAgent?: TeamAgent | null;
  requirementId?: string;
  skillNames?: string[];
  mentionUserIds?: string[];
  postBackToIssue?: boolean;
}): SuperAssistantAutopilotDefaults | null {
  if (!input.teamId || !input.leadAgent) {
    return null;
  }

  const initialAgentKey = resolveTeamAgentCronKey(input.leadAgent);

  return {
    initialAgentKey,
    autopilotContext: {
      source: 'super_assistant',
      teamId: input.teamId,
      agentSlotId: input.leadAgent.slotId,
      requirementId: input.requirementId,
      postBackToIssue: input.postBackToIssue ?? Boolean(input.requirementId),
      mentionUserIds: input.mentionUserIds,
      skillNames: input.skillNames?.slice(0, 5),
    },
  };
}
