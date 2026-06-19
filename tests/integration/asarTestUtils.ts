/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { listPackage } from '@electron/asar';

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

export function findLatestAppAsarUnderOut(repoRoot: string): string | null {
  const outDir = path.resolve(repoRoot, 'out');
  if (!fs.existsSync(outDir)) return null;

  const files = listFilesRecursive(outDir);
  const asarFiles = files.filter((file) => path.basename(file) === 'app.asar');
  if (asarFiles.length === 0) return null;

  asarFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return asarFiles[0] || null;
}

export function getLatestFileMtimeMs(dir: string): number {
  const files = listFilesRecursive(dir);
  let latest = 0;

  for (const file of files) {
    const mtimeMs = fs.statSync(file).mtimeMs;
    if (mtimeMs > latest) {
      latest = mtimeMs;
    }
  }

  return latest;
}

export function resolveDefaultAppAsarPath(repoRoot: string): string | null {
  const appAsarPath = findLatestAppAsarUnderOut(repoRoot);
  if (!appAsarPath) return null;

  const rendererDir = path.resolve(repoRoot, 'out/renderer');
  if (!fs.existsSync(rendererDir)) {
    return appAsarPath;
  }

  const rendererLatestMtime = getLatestFileMtimeMs(rendererDir);
  const asarMtime = fs.statSync(appAsarPath).mtimeMs;

  // If renderer build artifacts are newer than app.asar, the package is stale.
  if (rendererLatestMtime > asarMtime + 1000) {
    return null;
  }

  return appAsarPath;
}

/** List packaged app.asar entries without spawning bunx/npx (Windows-safe). */
export function getAsarEntries(asarPath: string): Set<string> {
  const lines = listPackage(asarPath, { isPack: false });
  if (!lines.length) {
    throw new Error(`app.asar is empty or unreadable: ${asarPath}`);
  }

  return new Set(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => toPosixPath(line).replace(/^\//, ''))
  );
}
