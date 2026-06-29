/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import { AionrsMcpAgent } from '@process/services/mcpServices/agents/OneCmdAionrsMcpAgent';
import { getBuiltinMcpScriptPath } from '@process/utils/initStorage';
import { BUILTIN_WEB_TOOLS_ID, BUILTIN_WEB_TOOLS_NAME } from '@process/resources/builtinMcp/constants';

/**
 * Ensure aionrs (the standalone Rust binary) has the built-in `one-web-tools` MCP
 * server in its global config.toml. aionrs is excluded from the ACP sync path
 * (acpTypes.ts excludes it from POTENTIAL_ACP_CLIS), so without this it has no
 * web-search tool and the model falls back to `curl`-ing Baidu via bash or
 * fabricating links. Mirrors the ACP runtime injection at acp/index.ts:1691.
 *
 * Idempotent — installMcpServers overwrites by name. Failures are logged and
 * swallowed; missing config must not block app startup or aionrs sessions.
 */
export async function ensureAionrsBuiltinMcp(): Promise<void> {
  try {
    const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-web-tools');
    const now = Date.now();
    const server: IMcpServer = {
      id: BUILTIN_WEB_TOOLS_ID,
      name: BUILTIN_WEB_TOOLS_NAME,
      description: 'Built-in web fetch and search (Baidu/Bing/DuckDuckGo). Injected for aionrs.',
      enabled: true,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: [scriptPath],
        env: {},
      },
      status: 'connected',
      createdAt: now,
      updatedAt: now,
      originalJson: JSON.stringify(
        {
          [BUILTIN_WEB_TOOLS_NAME]: {
            command: 'node',
            args: [scriptPath],
          },
        },
        null,
        2
      ),
    };

    const result = await new AionrsMcpAgent().installMcpServers([server]);
    if (!result.success) {
      console.warn('[aionrs] Failed to inject built-in web tools MCP:', result.error);
      return;
    }
    console.log('[aionrs] Built-in web tools MCP ensured in config.toml');
  } catch (error) {
    console.warn(
      '[aionrs] ensureAionrsBuiltinMcp skipped:',
      error instanceof Error ? error.message : String(error)
    );
  }
}
