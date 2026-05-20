/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AgentToolkitConfig,
  DEFAULT_AGENT_TOOLKIT_CONFIG,
  normalizeAgentToolkitConfig,
} from '@/common/config/agentToolkitConfig';
import { ProcessConfig } from '@process/utils/initStorage';

const CONFIG_KEY = 'tools.agentToolkit';

let cached: AgentToolkitConfig | null = null;

export async function getAgentToolkitConfig(forceRefresh = false): Promise<AgentToolkitConfig> {
  if (cached && !forceRefresh) {
    return cached;
  }
  try {
    const stored = await ProcessConfig.get(CONFIG_KEY);
    cached = normalizeAgentToolkitConfig(stored);
  } catch {
    cached = { ...DEFAULT_AGENT_TOOLKIT_CONFIG };
  }
  return cached;
}

export function invalidateAgentToolkitConfigCache(): void {
  cached = null;
}

export async function setAgentToolkitConfig(
  patch: Partial<AgentToolkitConfig>
): Promise<AgentToolkitConfig> {
  const next = normalizeAgentToolkitConfig({
    ...(await getAgentToolkitConfig(true)),
    ...patch,
  });
  await ProcessConfig.set(CONFIG_KEY, next);
  cached = next;
  return next;
}

export { CONFIG_KEY as AGENT_TOOLKIT_CONFIG_KEY };
