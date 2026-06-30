/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

function getBinaryName(): string {
  return process.platform === 'win32' ? 'officecli.exe' : 'officecli';
}

/**
 * Resolve the absolute path to the officecli executable.
 *
 * Search order:
 *  1. Bundled with app (production) — resources/bundled-officecli/{platform-arch}/officecli[.exe]
 *  2. Dev mode — project root resources/bundled-officecli/{platform-arch}/officecli[.exe]
 *  3. User local install — %LOCALAPPDATA%\OfficeCli\officecli.exe (Windows)
 *  4. System PATH fallback — bare "officecli" (triggers ENOENT → auto-install if missing)
 */
export function resolveOfficecliBinary(): string {
  const runtimeKey = `${process.platform}-${process.arch}`;
  const binaryName = getBinaryName();

  // 1. Production: bundled inside app.asar / extraResources
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const bundled = join(resourcesPath, 'bundled-officecli', runtimeKey, binaryName);
    if (existsSync(bundled)) return bundled;
  }

  // 2. Dev mode: project root resources/
  if (process.env.NODE_ENV === 'development') {
    const devBundled = join(process.cwd(), 'resources', 'bundled-officecli', runtimeKey, binaryName);
    if (existsSync(devBundled)) return devBundled;
  }

  // 3. User local install (Windows: installed via irm https://d.officecli.ai/install.ps1 | iex)
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const candidate = join(localAppData, 'OfficeCli', binaryName);
      if (existsSync(candidate)) return candidate;
    }
  } else {
    const homeDir = process.env.HOME || '';
    for (const p of [join(homeDir, '.local', 'bin', binaryName), '/usr/local/bin/' + binaryName]) {
      if (p && existsSync(p)) return p;
    }
  }

  // 4. PATH fallback
  return 'officecli';
}

/**
 * Return the directory containing the resolved officecli binary, or null if
 * falling back to PATH (no absolute path resolved).
 */
export function resolveOfficecliDir(): string | null {
  const p = resolveOfficecliBinary();
  if (p === 'officecli') return null;
  return require('node:path').dirname(p);
}
