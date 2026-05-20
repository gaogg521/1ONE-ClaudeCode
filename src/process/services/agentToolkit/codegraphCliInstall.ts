/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAgentToolkitDir } from './constants';
import { getAgentToolkitConfig } from './config';
import { isCodegraphBundled, resolveCodegraphInvocation } from './bundledCli';

const execFileAsync = promisify(execFile);

const INSTALL_FLAG = 'codegraph-cli-install-done';

function getInstallFlagPath(): string {
  return `${getAgentToolkitDir()}/${INSTALL_FLAG}`;
}

/**
 * Write CodeGraph MCP entries into external CLI configs (copilot, opencode, etc.).
 * Uses bundled CLI when present, otherwise npx.
 */
export async function ensureCodegraphCliInstalled(): Promise<void> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled || !toolkit.codegraphEnabled) {
    return;
  }

  const flagPath = getInstallFlagPath();
  if (existsSync(flagPath)) {
    return;
  }

  try {
    await fs.mkdir(getAgentToolkitDir(), { recursive: true });
    const inv = resolveCodegraphInvocation([
      'install',
      '--target=auto',
      '--location=global',
      '--yes',
      '--no-permissions',
    ]);
    console.log(
      `[agentToolkit] Running codegraph install (${inv.source}${isCodegraphBundled() ? ', bundled' : ''})...`
    );
    await execFileAsync(inv.command, inv.args, {
      env: inv.env,
      timeout: 10 * 60 * 1000,
      windowsHide: true,
    });
    await fs.writeFile(flagPath, new Date().toISOString(), 'utf-8');
    console.log('[agentToolkit] codegraph install complete');
  } catch (error) {
    console.warn(
      '[agentToolkit] codegraph install failed (1ONE MCP may still work via bundled/npx):',
      error instanceof Error ? error.message : String(error)
    );
  }
}
