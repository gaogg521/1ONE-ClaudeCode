/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type AgentToolkitConfig = {
  /** Master switch for bundled agent toolkit features */
  enabled: boolean;
  /** Enable built-in CodeGraph MCP server */
  codegraphEnabled: boolean;
  /** Auto-run `codegraph init --index` when user opens a project folder */
  codegraphAutoIndex: boolean;
  /** Run `agent-browser install` on first app launch */
  agentBrowserAutoInstall: boolean;
  /** Inject Superpowers session-start context on first message */
  superpowersHooksEnabled: boolean;
  /**
   * Inject skills index for all agents (including those with native skill dirs).
   * When false, only custom workspaces and agents without native skills get the index.
   */
  injectSkillsForAllAgents: boolean;
};

export const DEFAULT_AGENT_TOOLKIT_CONFIG: AgentToolkitConfig = {
  enabled: true,
  codegraphEnabled: true,
  codegraphAutoIndex: true,
  agentBrowserAutoInstall: true,
  superpowersHooksEnabled: true,
  injectSkillsForAllAgents: true,
};

export function normalizeAgentToolkitConfig(
  value: Partial<AgentToolkitConfig> | undefined | null
): AgentToolkitConfig {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AGENT_TOOLKIT_CONFIG };
  }
  return {
    enabled: value.enabled ?? DEFAULT_AGENT_TOOLKIT_CONFIG.enabled,
    codegraphEnabled: value.codegraphEnabled ?? DEFAULT_AGENT_TOOLKIT_CONFIG.codegraphEnabled,
    codegraphAutoIndex: value.codegraphAutoIndex ?? DEFAULT_AGENT_TOOLKIT_CONFIG.codegraphAutoIndex,
    agentBrowserAutoInstall: value.agentBrowserAutoInstall ?? DEFAULT_AGENT_TOOLKIT_CONFIG.agentBrowserAutoInstall,
    superpowersHooksEnabled: value.superpowersHooksEnabled ?? DEFAULT_AGENT_TOOLKIT_CONFIG.superpowersHooksEnabled,
    injectSkillsForAllAgents: value.injectSkillsForAllAgents ?? DEFAULT_AGENT_TOOLKIT_CONFIG.injectSkillsForAllAgents,
  };
}
