/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IMcpServer, IMcpServerTransport } from '@/common/config/storage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';

type CopilotMcpEntry = {
  type: 'local' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tools?: string[];
};

type CopilotMcpConfigFile = {
  mcpServers?: Record<string, CopilotMcpEntry>;
};

function toCopilotEntry(transport: IMcpServerTransport): CopilotMcpEntry | null {
  if (transport.type === 'stdio') {
    return {
      type: 'local',
      command: transport.command,
      args: transport.args || [],
      env: transport.env || {},
      tools: ['*'],
    };
  }
  if (transport.type === 'http' || transport.type === 'streamable_http' || transport.type === 'sse') {
    return {
      type: 'http',
      url: transport.url,
      headers: transport.headers || {},
      tools: ['*'],
    };
  }
  return null;
}

function fromCopilotEntry(entry: CopilotMcpEntry): IMcpServerTransport | null {
  if (entry.type === 'local') {
    if (!entry.command) return null;
    return {
      type: 'stdio',
      command: entry.command,
      args: entry.args || [],
      env: entry.env || {},
    };
  }
  if (entry.type === 'http' && entry.url) {
    return {
      type: 'http',
      url: entry.url,
      headers: entry.headers || {},
    };
  }
  return null;
}

/**
 * GitHub Copilot CLI MCP agent — reads/writes ~/.copilot/mcp-config.json
 * @see https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
 */
export class CopilotMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('copilot');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'http', 'streamable_http', 'sse'];
  }

  private getMcpConfigPath(): string {
    return path.join(os.homedir(), '.copilot', 'mcp-config.json');
  }

  private readConfig(): CopilotMcpConfigFile {
    try {
      const configPath = this.getMcpConfigPath();
      if (!fs.existsSync(configPath)) {
        return { mcpServers: {} };
      }
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as CopilotMcpConfigFile;
      return { mcpServers: parsed.mcpServers ?? {} };
    } catch {
      return { mcpServers: {} };
    }
  }

  private writeConfig(config: CopilotMcpConfigFile): void {
    const configPath = this.getMcpConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  }

  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      const config = this.readConfig();
      const entries = config.mcpServers ?? {};
      const now = Date.now();
      const servers: IMcpServer[] = [];

      for (const [name, entry] of Object.entries(entries)) {
        const transport = fromCopilotEntry(entry);
        if (!transport) continue;
        servers.push({
          id: `copilot-mcp-${name}`,
          name,
          description: `Copilot MCP: ${name}`,
          enabled: true,
          transport,
          createdAt: now,
          updatedAt: now,
          originalJson: JSON.stringify({ mcpServers: { [name]: entry } }, null, 2),
        });
      }
      return servers;
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        const config = this.readConfig();
        const merged = { ...config.mcpServers };

        for (const server of mcpServers) {
          const entry = toCopilotEntry(server.transport);
          if (!entry) {
            console.warn(`[CopilotMcpAgent] Unsupported transport for ${server.name}`);
            continue;
          }
          merged[server.name] = entry;
        }

        this.writeConfig({ mcpServers: merged });
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        const config = this.readConfig();
        const merged = { ...config.mcpServers };
        if (!(mcpServerName in merged)) {
          return { success: true };
        }
        delete merged[mcpServerName];
        this.writeConfig({ mcpServers: merged });
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
