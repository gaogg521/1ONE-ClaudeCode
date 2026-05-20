/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  BUILTIN_CODEGRAPH_ID,
  BUILTIN_CODEGRAPH_NAME,
} from '@process/resources/builtinMcp/constants';
import type { IMcpServer } from '@/common/config/storage';
import { CODEGRAPH_MARKER_DIR } from './constants';
import { getAgentToolkitConfig } from './config';
import { isCodegraphBundled, resolveCodegraphInvocation } from './bundledCli';

const execFileAsync = promisify(execFile);

const inFlightInits = new Set<string>();

export function buildCodegraphMcpServer(now: number): IMcpServer {
  const inv = resolveCodegraphInvocation(['serve', '--mcp']);
  const originalJson = JSON.stringify(
    {
      [BUILTIN_CODEGRAPH_NAME]: {
        command: inv.command,
        args: inv.args,
        env: inv.env,
        source: inv.source,
      },
    },
    null,
    2
  );

  return {
    id: BUILTIN_CODEGRAPH_ID,
    name: BUILTIN_CODEGRAPH_NAME,
    description:
      'Local code knowledge graph (CodeGraph). Indexes symbols, call graphs, and impact analysis for the workspace.',
    enabled: true,
    builtin: true,
    transport: {
      type: 'stdio',
      command: inv.command,
      args: inv.args,
      env: inv.env,
    },
    createdAt: now,
    updatedAt: now,
    originalJson,
  };
}

export function isCodegraphInitialized(workspace: string): boolean {
  return existsSync(path.join(workspace, CODEGRAPH_MARKER_DIR));
}

/**
 * Initialize and index CodeGraph for a workspace (non-interactive).
 */
export async function ensureCodegraphWorkspaceIndexed(workspace: string): Promise<void> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled || !toolkit.codegraphEnabled || !toolkit.codegraphAutoIndex) {
    return;
  }

  const resolved = path.resolve(workspace);
  if (!existsSync(resolved)) {
    return;
  }
  if (isCodegraphInitialized(resolved)) {
    return;
  }
  if (inFlightInits.has(resolved)) {
    return;
  }
  inFlightInits.add(resolved);

  try {
    const inv = resolveCodegraphInvocation(['init', '--index', resolved]);
    await execFileAsync(inv.command, inv.args, {
      env: inv.env,
      cwd: resolved,
      timeout: 30 * 60 * 1000,
      windowsHide: true,
    });
    console.log(
      `[agentToolkit] CodeGraph initialized for workspace (${inv.source}): ${resolved}`
    );
  } catch (error) {
    console.warn(
      `[agentToolkit] CodeGraph init failed for ${resolved}:`,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    inFlightInits.delete(resolved);
  }
}
