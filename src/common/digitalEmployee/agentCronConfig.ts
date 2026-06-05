/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronAgentConfig } from '@/common/adapter/ipcBridge';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import { ACP_ROUTED_PRESET_TYPES } from '@/common/types/acpTypes';
import type { AutopilotContext } from '@/common/types/autopilotContext';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';

export function buildPersonalAgentAutopilotContext(
  agent: PersonalAgent,
  input: {
    requirementId?: string;
    skillNames?: string[];
    mentionUserIds?: string[];
    postBackToIssue?: boolean;
  } = {}
): AutopilotContext {
  return {
    source: 'super_assistant',
    teamId: 'personal',
    agentSlotId: agent.id,
    personalAgentId: agent.id,
    ownerUserId: agent.ownerUserId,
    requirementId: input.requirementId,
    postBackToIssue: input.postBackToIssue ?? Boolean(input.requirementId),
    mentionUserIds: input.mentionUserIds,
    skillNames: input.skillNames?.slice(0, 5),
  };
}

export function resolvePersonalAgentCronConfig(agent: PersonalAgent): ICronAgentConfig | null {
  const backend = (agent.agentType || agent.conversationType) as AcpBackendAll | undefined;
  if (!backend) {
    return null;
  }

  if (agent.customAgentId) {
    const isPreset =
      backend === 'gemini' ||
      (ACP_ROUTED_PRESET_TYPES as readonly string[]).includes(backend);
    return {
      backend,
      name: agent.name,
      cliPath: agent.cliPath,
      isPreset,
      customAgentId: agent.customAgentId,
      presetAgentType: isPreset ? backend : undefined,
      autopilotContext: buildPersonalAgentAutopilotContext(agent),
    };
  }

  return {
    backend,
    name: agent.name,
    cliPath: agent.cliPath,
    autopilotContext: buildPersonalAgentAutopilotContext(agent),
  };
}
