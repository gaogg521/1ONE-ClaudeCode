/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildDigitalEmployeePresetContext } from '@/common/digitalEmployee/presetContext';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';

export type PersonalAgentPresetResolution = {
  presetContext?: string;
  enabledSkills?: string[];
  preferredModelId?: string;
};

export async function resolvePersonalAgentPreset(
  personalAgentId: string,
  ownerUserId = DESKTOP_OPERATOR_USER_ID
): Promise<PersonalAgentPresetResolution | null> {
  const repository = new SqlitePersonalAgentRepository();
  const agent = await repository.findById(personalAgentId, ownerUserId);
  if (!agent) {
    return null;
  }
  return mapPersonalAgentToPreset(agent);
}

export function mapPersonalAgentToPreset(agent: PersonalAgent): PersonalAgentPresetResolution {
  const automation = agent.automationConfig ?? {};
  const skillIds = Array.isArray(automation.skillIds)
    ? automation.skillIds.filter((id): id is string => typeof id === 'string')
    : [];
  const preferredModelId =
    typeof automation.preferredModelId === 'string' ? automation.preferredModelId : undefined;
  const presetContext = buildDigitalEmployeePresetContext({
    name: agent.name,
    description: agent.description,
    instructions:
      typeof automation.instructions === 'string' ? automation.instructions : undefined,
  });
  return {
    presetContext,
    enabledSkills: skillIds.length > 0 ? skillIds : undefined,
    preferredModelId,
  };
}
