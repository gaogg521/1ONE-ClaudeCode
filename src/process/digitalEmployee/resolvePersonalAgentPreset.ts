/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildDigitalEmployeePresetBundle,
  type DigitalEmployeePresetBundle,
} from '@/common/digitalEmployee/runFallback';
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
  const bundle: DigitalEmployeePresetBundle = buildDigitalEmployeePresetBundle(agent);
  return {
    presetContext: bundle.presetContext,
    enabledSkills: bundle.enabledSkills,
    preferredModelId: bundle.preferredModelId,
  };
}
