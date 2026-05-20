/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ensureAgentBrowserChromeInstalled } from './agentBrowser';
import { ensureCodegraphCliInstalled } from './codegraphCliInstall';
import { getAgentToolkitConfig } from './config';
import { syncAgentToolkitMcpToCliAgents } from './syncCliMcp';
import { syncGlobalAgentToolkitSkills } from './syncGlobalSkills';
import { syncVendoredBuiltinSkills } from './syncVendoredSkills';

let bootstrapped = false;

/**
 * One-time async bootstrap for bundled agent toolkit (skills vendor, Chrome, etc.).
 * Non-blocking for app window; failures are logged and retried on next launch.
 */
export async function bootstrapAgentToolkit(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  bootstrapped = true;

  const config = await getAgentToolkitConfig();
  if (!config.enabled) {
    return;
  }

  try {
    await syncVendoredBuiltinSkills();
    await syncGlobalAgentToolkitSkills();
  } catch (error) {
    console.warn('[agentToolkit] syncVendoredBuiltinSkills failed:', error);
  }

  void ensureCodegraphCliInstalled();
  void syncAgentToolkitMcpToCliAgents();

  if (config.agentBrowserAutoInstall) {
    void ensureAgentBrowserChromeInstalled();
  }
}
