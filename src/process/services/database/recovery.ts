/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { setTimeout as delay } from 'node:timers/promises';

const SQLITE_SIDECAR_SUFFIXES = ['-wal', '-shm'] as const;

export function removeSqliteSidecars(dbPath: string): void {
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    const sidecar = `${dbPath}${suffix}`;
    if (!fs.existsSync(sidecar)) {
      continue;
    }
    try {
      fs.unlinkSync(sidecar);
      console.log(`[Database] Removed stale SQLite sidecar: ${sidecar}`);
    } catch (error) {
      console.warn(`[Database] Could not remove sidecar ${sidecar}:`, error);
    }
  }
}

export async function moveOrRemoveFileWithRetry(sourcePath: string, attempts = 6): Promise<'moved' | 'removed'> {
  if (!fs.existsSync(sourcePath)) {
    return 'removed';
  }

  const backupPath = `${sourcePath}.backup.${Date.now()}`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.renameSync(sourcePath, backupPath);
      console.log(`[Database] Backed up corrupted database to: ${backupPath}`);
      return 'moved';
    } catch {
      // rename can fail on Windows when the file is still open — fall through to unlink retries
    }

    try {
      fs.unlinkSync(sourcePath);
      console.log(`[Database] Deleted corrupted database file: ${sourcePath}`);
      return 'removed';
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
      await delay(150 * (attempt + 1));
    }
  }

  return 'removed';
}

export async function quarantineCorruptedDatabase(dbPath: string): Promise<void> {
  removeSqliteSidecars(dbPath);
  try {
    await moveOrRemoveFileWithRetry(dbPath);
  } catch (error) {
    throw new Error(`Database is corrupted and cannot be recovered. Please manually delete: ${dbPath}`, {
      cause: error,
    });
  }
  removeSqliteSidecars(dbPath);
}
