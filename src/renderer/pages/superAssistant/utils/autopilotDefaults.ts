/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildPersonalAgentAutopilotContext } from '@/common/digitalEmployee/agentCronConfig';
import { buildIssueAssignmentPrompt, buildPersonalDigitalEmployeeCronPrompt } from '@/common/digitalEmployee/runPrompt';
import type { AutopilotContext } from '@/common/types/autopilotContext';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import type { TeamAgent } from '@/common/types/teamTypes';

export { buildIssueAssignmentPrompt, buildPersonalDigitalEmployeeCronPrompt };

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

export function buildAutopilotForPersonalAgent(
  agent: PersonalAgent,
  input: {
    requirementId?: string;
    skillNames?: string[];
    mentionUserIds?: string[];
    postBackToIssue?: boolean;
  } = {}
): SuperAssistantAutopilotDefaults | null {
  const stubAgent: TeamAgent = {
    slotId: agent.id,
    conversationId: '',
    role: 'teammate',
    agentType: agent.agentType,
    agentName: agent.name,
    conversationType: agent.conversationType,
    customAgentId: agent.customAgentId,
    cliPath: agent.cliPath,
    status: 'idle',
  };
  const initialAgentKey = resolveTeamAgentCronKey(stubAgent);
  if (!initialAgentKey) {
    return null;
  }
  return {
    initialAgentKey,
    autopilotContext: buildPersonalAgentAutopilotContext(agent, input),
  };
}

export function buildSuperAssistantAutopilotDefaults(input: {
  teamId?: string;
  /** @deprecated prefer `agent` */
  leadAgent?: TeamAgent | null;
  agent?: TeamAgent | null;
  requirementId?: string;
  skillNames?: string[];
  mentionUserIds?: string[];
  postBackToIssue?: boolean;
}): SuperAssistantAutopilotDefaults | null {
  const agent = input.agent ?? input.leadAgent ?? null;
  if (!input.teamId || !agent) {
    return null;
  }

  const initialAgentKey = resolveTeamAgentCronKey(agent);

  return {
    initialAgentKey,
    autopilotContext: {
      source: 'super_assistant',
      teamId: input.teamId,
      agentSlotId: agent.slotId,
      requirementId: input.requirementId,
      postBackToIssue: input.postBackToIssue ?? Boolean(input.requirementId),
      mentionUserIds: input.mentionUserIds,
      skillNames: input.skillNames?.slice(0, 5),
    },
  };
}
