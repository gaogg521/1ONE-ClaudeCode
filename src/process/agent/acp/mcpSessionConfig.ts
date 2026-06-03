/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import type { AcpResponse } from '@/common/types/acpTypes';
import { BUILTIN_WEB_TOOLS_NAME } from '@/process/resources/builtinMcp/constants';

export interface AcpSessionMcpNameValue {
  name: string;
  value: string;
}

export interface AcpSessionMcpServerStdio {
  type?: 'stdio';
  name: string;
  command: string;
  args: string[];
  env: AcpSessionMcpNameValue[];
}

export interface AcpSessionMcpServerHttpLike {
  type: 'http' | 'sse';
  name: string;
  url: string;
  headers?: AcpSessionMcpNameValue[];
}

export type AcpSessionMcpServer = AcpSessionMcpServerStdio | AcpSessionMcpServerHttpLike;

export interface AcpMcpCapabilities {
  stdio: boolean;
  http: boolean;
  sse: boolean;
}

const DEFAULT_ACP_MCP_CAPABILITIES: AcpMcpCapabilities = {
  stdio: true,
  http: true,
  sse: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNameValueEntries(source?: Record<string, string>): AcpSessionMcpNameValue[] | undefined {
  if (!source) return undefined;
  const entries = Object.entries(source)
    .filter(([name, value]) => typeof name === 'string' && typeof value === 'string')
    .map(([name, value]) => ({ name, value }));
  return entries.length > 0 ? entries : undefined;
}

export function parseAcpMcpCapabilities(response: AcpResponse | null): AcpMcpCapabilities {
  const result = isRecord(response?.result) ? response.result : null;
  const agentCapabilities = result && isRecord(result.agentCapabilities) ? result.agentCapabilities : null;
  const mcpCapabilities =
    agentCapabilities && isRecord(agentCapabilities.mcpCapabilities) ? agentCapabilities.mcpCapabilities : null;

  return {
    stdio: typeof mcpCapabilities?.stdio === 'boolean' ? mcpCapabilities.stdio : DEFAULT_ACP_MCP_CAPABILITIES.stdio,
    http: typeof mcpCapabilities?.http === 'boolean' ? mcpCapabilities.http : DEFAULT_ACP_MCP_CAPABILITIES.http,
    sse: typeof mcpCapabilities?.sse === 'boolean' ? mcpCapabilities.sse : DEFAULT_ACP_MCP_CAPABILITIES.sse,
  };
}

function shouldInjectBuiltinServer(server: IMcpServer): boolean {
  if (server.builtin !== true || !server.enabled) {
    return false;
  }

  return server.status === undefined || server.status === 'connected';
}

function shouldInjectEnabledServer(server: IMcpServer): boolean {
  if (!server.enabled) {
    return false;
  }
  if (server.status === 'disconnected' || server.status === 'error') {
    return false;
  }
  return true;
}

function mapServerToAcpSession(
  server: IMcpServer,
  effectiveCapabilities: AcpMcpCapabilities
): AcpSessionMcpServer | null {
  switch (server.transport.type) {
    case 'stdio':
      if (!effectiveCapabilities.stdio) return null;
      return {
        type: 'stdio',
        name: server.name,
        command: server.transport.command,
        args: server.transport.args || [],
        env: toNameValueEntries(server.transport.env) ?? [],
      };
    case 'http':
    case 'streamable_http':
      if (!effectiveCapabilities.http) return null;
      return {
        type: 'http',
        name: server.name,
        url: server.transport.url,
        headers: toNameValueEntries(server.transport.headers),
      };
    case 'sse':
      if (!effectiveCapabilities.sse) return null;
      return {
        type: 'sse',
        name: server.name,
        url: server.transport.url,
        headers: toNameValueEntries(server.transport.headers),
      };
    default:
      return null;
  }
}

export function buildBuiltinAcpSessionMcpServers(
  mcpServers: IMcpServer[] | undefined | null,
  capabilities: Partial<AcpMcpCapabilities> = DEFAULT_ACP_MCP_CAPABILITIES
): AcpSessionMcpServer[] {
  if (!Array.isArray(mcpServers) || mcpServers.length === 0) {
    return [];
  }

  const effectiveCapabilities: AcpMcpCapabilities = {
    ...DEFAULT_ACP_MCP_CAPABILITIES,
    ...capabilities,
  };

  return mcpServers
    .filter(shouldInjectBuiltinServer)
    .map((server) => mapServerToAcpSession(server, effectiveCapabilities))
    .filter((server): server is AcpSessionMcpServer => server !== null);
}

/** Inject all enabled MCP servers from 1ONE config into ACP session/new (when agent toolkit is on). */
export function buildEnabledAcpSessionMcpServers(
  mcpServers: IMcpServer[] | undefined | null,
  capabilities: Partial<AcpMcpCapabilities> = DEFAULT_ACP_MCP_CAPABILITIES
): AcpSessionMcpServer[] {
  if (!Array.isArray(mcpServers) || mcpServers.length === 0) {
    return [];
  }

  const effectiveCapabilities: AcpMcpCapabilities = {
    ...DEFAULT_ACP_MCP_CAPABILITIES,
    ...capabilities,
  };

  return mcpServers
    .filter(shouldInjectEnabledServer)
    .map((server) => mapServerToAcpSession(server, effectiveCapabilities))
    .filter((server): server is AcpSessionMcpServer => server !== null);
}

/** Config shape passed from TeamSessionService to AgentManagers */
export type TeamMcpStdioConfig = {
  name: string;
  command: string;
  args: string[];
  env: AcpSessionMcpNameValue[];
};

/**
 * Build the AcpSessionMcpServer entry for a team MCP stdio server.
 * Returns null if the config is missing or has no command — callers should
 * simply skip injection in that case.
 */
/** Always-on built-in web fetch/search MCP (Baidu, no Google login). */
export function buildOneWebToolsAcpSessionMcpServer(scriptPath: string): AcpSessionMcpServerStdio {
  return {
    type: 'stdio',
    name: BUILTIN_WEB_TOOLS_NAME,
    command: 'node',
    args: [scriptPath],
    env: [],
  };
}

export function buildTeamMcpServer(config: TeamMcpStdioConfig | undefined | null): AcpSessionMcpServerStdio | null {
  if (!config || !config.command) return null;
  return {
    name: config.name,
    command: config.command,
    args: config.args,
    env: config.env,
  };
}
