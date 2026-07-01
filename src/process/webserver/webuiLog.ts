/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-based logger for WebUI server-side code.
 *
 * Why this exists: console.* in the main process triggers @office-ai/platform's
 * console patch → bridge.adapter.emit('officeai-logger') → win.webContents.send
 * + broadcastToAll. In Express route handlers / middleware that run on every
 * request (or in catch blocks that fire on errors), this blocks the main
 * process event loop and freezes the app. See CLAUDE.md "主进程 console 禁令".
 *
 * Use this instead of console.error/warn in src/process/webserver/**.
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

/** Log a WebUI route error to logs/webui-route-errors.log (instead of console.error). */
export function logRouteError(label: string, error: unknown): void {
  writeLog('webui-route-errors.log', label, error);
}

/** Log a WebUI warning to logs/webui-route-errors.log. */
export function logRouteWarn(label: string, error: unknown): void {
  writeLog('webui-route-errors.log', label, error);
}
