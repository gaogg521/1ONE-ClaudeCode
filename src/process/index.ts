/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import '@/common/platform/register-electron';
// configureChromium sets app name (dev isolation) and Chromium flags — must run before other modules
import '@process/utils/configureChromium';

import { app } from 'electron';

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}
import initStorage, { initStorageCore, initStorageDeferred } from './utils/initStorage';
import { bootstrapAgentToolkit } from './services/agentToolkit/bootstrap';
import './utils/initBridge';
import './services/i18n'; // Initialize i18n for main process
import { getChannelManager } from '@process/channels';
import { ExtensionRegistry } from '@process/extensions';

/** Fast storage path — unblocks desktop window creation. */
export const initializeProcess = initStorageCore;

/** MCP / builtin assistants — may run while the window is already visible. */
export const initializeStorageDeferred = initStorageDeferred;

/** Full storage init (core + deferred) for callers that need everything before proceeding. */
export const initializeStorageFull = initStorage;

/** Extensions, channels, agent toolkit — runs after the window is created so startup feels responsive. */
export const initializeBackgroundServices = async (): Promise<void> => {
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[1ONE:process] ${label} +${Math.round(performance.now() - t0)}ms`);

  void bootstrapAgentToolkit();
  mark('agentToolkit');

  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ExtensionRegistry:', error);
  }
  mark('ExtensionRegistry');

  try {
    await getChannelManager().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ChannelManager:', error);
  }
  mark('ChannelManager');
};
