/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import { acpDetector } from '@process/agent/acp/AcpDetector';
import { mcpService } from '@process/services/mcpServices/McpService';
import { ProcessConfig } from '@process/utils/initStorage';
import { getAgentToolkitConfig } from './config';

/**
 * Push enabled built-in MCP servers (e.g. CodeGraph) into CLI config files
 * for agents that do not receive session/new MCP injection.
 */
export async function syncAgentToolkitMcpToCliAgents(): Promise<void> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled || !toolkit.codegraphEnabled) {
    return;
  }

  const mcpServers: IMcpServer[] = (await ProcessConfig.get('mcp.config').catch((): IMcpServer[] => [])) || [];
  const enabledBuiltin = mcpServers.filter((s) => s.builtin === true && s.enabled);
  if (enabledBuiltin.length === 0) {
    return;
  }

  const disabled = (await ProcessConfig.get('acp.disabledDetectedAgents').catch((): string[] => [])) || [];
  const agents = acpDetector
    .getDetectedAgents()
    .filter((agent) => !disabled.includes(agent.backend))
    .map((agent) => ({
      backend: agent.backend,
      name: agent.name,
      cliPath: agent.cliPath,
    }));

  if (agents.length === 0) {
    return;
  }

  const result = await mcpService.syncMcpToAgents(enabledBuiltin, agents);
  if (!result.success) {
    console.warn('[agentToolkit] Partial MCP CLI sync failures:', result.results.filter((r) => !r.success));
  } else {
    console.log(`[agentToolkit] Synced ${enabledBuiltin.length} builtin MCP server(s) to ${agents.length} CLI agent(s)`);
  }
}
