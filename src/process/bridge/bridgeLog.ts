/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-based logger for IPC bridge provider handlers (src/process/bridge/**).
 *
 * Why this exists: console.* in the main process triggers @office-ai/platform's
 * console patch → bridge.adapter.emit('officeai-logger') → win.webContents.send
 * + broadcastToAll. Every ipcBridge.*.provider() callback runs on the main
 * process's synchronous IPC dispatch stack, so console.* in a catch block here
 * blocks the event loop on every failing call. See CLAUDE.md "主进程 console 禁令"
 * and memory note ipc-console-deadlock (8 rounds of the same bug class).
 *
 * Use this instead of console.error/warn in src/process/bridge/**.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformServices } from '@/common/platform';

const LOGS_DIR = (() => {
  try {
    const dir = getPlatformServices().paths.getLogsDir();
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return '';
  }
})();

function writeLog(fileName: string, label: string, error: unknown): void {
  if (!LOGS_DIR) return;
  try {
    const msg = error instanceof Error
      ? `${error.message}\n${error.stack ?? ''}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);
    appendFileSync(
      join(LOGS_DIR, fileName),
      `[${new Date().toISOString()}] ${label}: ${msg}\n`,
      'utf-8'
    );
  } catch {
    // best-effort — never throw from a logger
  }
}

/** Log an IPC bridge error to logs/bridge-errors.log (instead of console.error). */
export function logBridgeError(label: string, error: unknown): void {
  writeLog('bridge-errors.log', label, error);
}

/** Log an IPC bridge warning to logs/bridge-errors.log. */
export function logBridgeWarn(label: string, error: unknown): void {
  writeLog('bridge-errors.log', label, error);
}
