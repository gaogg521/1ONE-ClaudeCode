/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Temporary diagnostic: wraps fs.writeFileSync/appendFileSync to log (async,
 * fire-and-forget — never blocking) which path is being written and how long
 * it took. Every previous freeze on this machine traced back to a thread
 * stuck in ntdll!ZwWriteFile, but static minidump analysis alone can't
 * recover the target filename without a handle-data stream. This watchdog
 * records the target path BEFORE the write starts (so even a write that
 * never returns still leaves a "STARTED" line to correlate with a freeze
 * timestamp) and again if it takes >50ms.
 *
 * Must be imported before any other module that might call
 * fs.writeFileSync/appendFileSync (electron-log, our own log helpers, etc.),
 * so import this first thing in the main process entry point.
 *
 * Remove once the culprit is found and fixed.
 */

import path from 'node:path';
import { app } from 'electron';

// `import * as fs from 'node:fs'` produces a read-only ESM namespace object
// once bundled — assigning fs.writeFileSync throws "Cannot set property
// ... which has only a getter". require() returns the mutable CommonJS
// module object instead, which is what we need to actually patch it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('node:fs') as typeof import('node:fs');

function getWatchdogLogPath(): string {
  const dir = path.join(app.getPath('userData'), 'logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort
  }
  return path.join(dir, 'fs-write-watchdog.log');
}

let logPath: string | null = null;
function getLogPathCached(): string | null {
  if (logPath) return logPath;
  try {
    logPath = getWatchdogLogPath();
  } catch {
    logPath = null;
  }
  return logPath;
}

function logAsync(line: string): void {
  const p = getLogPathCached();
  if (!p) return;
  try {
    fs.appendFile(p, `${line}\n`, 'utf-8', () => {
      // best-effort — never throw from the watchdog
    });
  } catch {
    // best-effort
  }
}

type SyncWriteFn = (...args: unknown[]) => unknown;

function wrapSyncWrite(name: string, orig: SyncWriteFn): SyncWriteFn {
  // orig is pre-bound to fs, so callers' `this` doesn't matter here.
  return function wrapped(...args: unknown[]) {
    const target = typeof args[0] === 'string' ? args[0] : String(args[0]);
    const startedAt = Date.now();
    const stack = new Error().stack?.split('\n').slice(2, 8).join(' | ') ?? '';
    logAsync(`[${new Date().toISOString()}] ${name} STARTED path=${target} stack=${stack}`);
    try {
      return orig(...args);
    } finally {
      const duration = Date.now() - startedAt;
      if (duration > 50) {
        logAsync(`[${new Date().toISOString()}] ${name} SLOW duration=${duration}ms path=${target}`);
      }
    }
  };
}

const origWriteFileSync = fs.writeFileSync.bind(fs);
const origAppendFileSync = fs.appendFileSync.bind(fs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(fs as any).writeFileSync = wrapSyncWrite('writeFileSync', origWriteFileSync as SyncWriteFn);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(fs as any).appendFileSync = wrapSyncWrite('appendFileSync', origAppendFileSync as SyncWriteFn);
