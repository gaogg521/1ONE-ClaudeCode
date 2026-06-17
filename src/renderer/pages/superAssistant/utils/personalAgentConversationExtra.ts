/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildDigitalEmployeePresetBundle } from '@/common/digitalEmployee/runFallback';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';

export function buildPersonalAgentConversationExtra(
  agent: PersonalAgent,
  ownerUserId: string,
  baseExtra?: ICreateConversationParams['extra']
): NonNullable<ICreateConversationParams['extra']> {
  const bundle = buildDigitalEmployeePresetBundle(agent);
  return {
    ...baseExtra,
    personalAgentId: agent.id,
    ownerUserId,
    tenantId: agent.tenantId ?? 'default',
    ...(bundle.preferredModelId && !baseExtra?.currentModelId ? { currentModelId: bundle.preferredModelId } : {}),
    presetContext: bundle.presetContext,
    presetRules: bundle.presetContext,
    ...(bundle.enabledSkills?.length ? { enabledSkills: bundle.enabledSkills } : {}),
  };
}
