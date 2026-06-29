/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import { AionrsMcpAgent } from '@process/services/mcpServices/agents/OneCmdAionrsMcpAgent';
import { getBuiltinMcpScriptPath } from '@process/utils/initStorage';
import {
  BUILTIN_WEB_TOOLS_ID,
  BUILTIN_WEB_TOOLS_NAME,
  BUILTIN_EXPORT_PDF_ID,
  BUILTIN_EXPORT_PDF_NAME,
} from '@process/resources/builtinMcp/constants';

/**
 * Ensure aionrs (the standalone Rust binary) has the built-in MCP servers in
 * its global config.toml. aionrs is excluded from the ACP sync path
 * (acpTypes.ts excludes it from POTENTIAL_ACP_CLIS), so without this it has no
 * web-search / PDF-export tool and the model falls back to `curl`-ing Baidu
 * via bash or installing Puppeteer. Mirrors the ACP runtime injection at
 * acp/index.ts:1691.
 *
 * Idempotent — installMcpServers overwrites by name. Failures are logged and
 * swallowed; missing config must not block app startup or aionrs sessions.
 */
export async function ensureAionrsBuiltinMcp(): Promise<void> {
  try {
    const now = Date.now();
    const servers: IMcpServer[] = [];

    // 1. one-web-tools (web fetch + search)
    const webToolsScriptPath = getBuiltinMcpScriptPath('builtin-mcp-web-tools');
    servers.push({
      id: BUILTIN_WEB_TOOLS_ID,
      name: BUILTIN_WEB_TOOLS_NAME,
      description: 'Built-in web fetch and search (Baidu/Bing/DuckDuckGo). Injected for aionrs.',
      enabled: true,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: [webToolsScriptPath],
        env: {},
      },
      status: 'connected',
      createdAt: now,
      updatedAt: now,
      originalJson: JSON.stringify(
        {
          [BUILTIN_WEB_TOOLS_NAME]: {
            command: 'node',
            args: [webToolsScriptPath],
          },
        },
        null,
        2
      ),
    });

    // 2. one-export-pdf (export_to_pdf tool — HTML/Office → PDF via main process)
    // The TCP port is allocated at runtime by exportPdfMcpServer; resolve it
    // dynamically so aionrs gets the live port every time config is re-synced.
    let exportPdfPort = 0;
    try {
      const { getExportPdfMcpPort } = await import('@process/services/exportPdfMcpServer');
      exportPdfPort = getExportPdfMcpPort();
    } catch {
      // TCP server module not loaded yet — skip env; re-sync later fills it in.
    }
    const exportPdfScriptPath = getBuiltinMcpScriptPath('builtin-mcp-export-pdf');
    const exportPdfEnv: Record<string, string> = exportPdfPort
      ? { EXPORT_PDF_MCP_PORT: String(exportPdfPort) }
      : {};
    servers.push({
      id: BUILTIN_EXPORT_PDF_ID,
      name: BUILTIN_EXPORT_PDF_NAME,
      description:
        'Built-in PDF export tool. Converts HTML/Office files to PDF via the 1ONE main-process converter. Use this instead of installing Puppeteer or other PDF libraries.',
      enabled: true,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: [exportPdfScriptPath],
        env: exportPdfEnv,
      },
      status: 'connected',
      createdAt: now,
      updatedAt: now,
      originalJson: JSON.stringify(
        {
          [BUILTIN_EXPORT_PDF_NAME]: {
            command: 'node',
            args: [exportPdfScriptPath],
            env: exportPdfEnv,
          },
        },
        null,
        2
      ),
    });

    const result = await new AionrsMcpAgent().installMcpServers(servers);
    if (!result.success) {
      console.warn('[aionrs] Failed to inject built-in MCP servers:', result.error);
      return;
    }
    console.log(
      `[aionrs] Built-in MCP servers ensured in config.toml: ${servers.map((s) => s.name).join(', ')}`
    );
  } catch (error) {
    console.warn(
      '[aionrs] ensureAionrsBuiltinMcp skipped:',
      error instanceof Error ? error.message : String(error)
    );
  }
}
