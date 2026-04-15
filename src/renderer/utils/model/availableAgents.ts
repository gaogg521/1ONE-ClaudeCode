/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AvailableAgent } from './agentTypes';

export const AVAILABLE_AGENTS_SWR_KEY = 'acp.agents.available';

/**
 * Agent list rarely changes during chat; SWR defaults (revalidate on focus) spam the main process
 * with getAvailableAgents IPC — unrelated to model replies and confusing in logs.
 */
export const AVAILABLE_AGENTS_SWR_OPTIONS = {
  revalidateOnFocus: false,
  dedupingInterval: 60_000,
} as const;

export function filterAvailableAgentsForUi(availableAgents: AvailableAgent[]): AvailableAgent[] {
  return availableAgents.filter((agent) => !(agent.backend === 'gemini' && agent.cliPath));
}

export function splitConversationDropdownAgents(availableAgents: AvailableAgent[]): {
  cliAgents: AvailableAgent[];
  presetAssistants: AvailableAgent[];
} {
  return {
    cliAgents: availableAgents.filter((agent) => agent.backend !== 'custom' && !agent.isPreset),
    presetAssistants: availableAgents.filter((agent) => agent.isPreset === true),
  };
}
