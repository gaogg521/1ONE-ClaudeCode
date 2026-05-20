/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAgentBrowserInstallFlagPath, getAgentToolkitDir } from './constants';
import { getAgentToolkitConfig } from './config';
import { resolveAgentBrowserInvocation } from './bundledCli';

const execFileAsync = promisify(execFile);

let installPromise: Promise<void> | null = null;

/**
 * Download Chrome for Testing via agent-browser (first launch only).
 * Uses bundled agent-browser CLI when packaged, otherwise npx.
 */
export async function ensureAgentBrowserChromeInstalled(): Promise<void> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled || !toolkit.agentBrowserAutoInstall) {
    return;
  }

  const flagPath = getAgentBrowserInstallFlagPath();
  if (existsSync(flagPath)) {
    return;
  }
  if (installPromise) {
    return installPromise;
  }

  installPromise = (async () => {
    try {
      await fs.mkdir(getAgentToolkitDir(), { recursive: true });
      const inv = resolveAgentBrowserInvocation(['install']);
      console.log(`[agentToolkit] Installing agent-browser Chrome (${inv.source})...`);
      await execFileAsync(inv.command, inv.args, {
        env: inv.env,
        timeout: 30 * 60 * 1000,
        windowsHide: true,
      });
      await fs.writeFile(flagPath, new Date().toISOString(), 'utf-8');
      console.log('[agentToolkit] agent-browser Chrome install complete');
    } catch (error) {
      console.warn(
        '[agentToolkit] agent-browser install failed (will retry next launch):',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      installPromise = null;
    }
  })();

  return installPromise;
}
