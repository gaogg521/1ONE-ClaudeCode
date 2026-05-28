/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { moveOrRemoveFileWithRetry, removeSqliteSidecars } from '@process/services/database/recovery';

describe('database recovery helpers', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-db-recovery-'));
  const dbPath = path.join(tempDir, '1one.db');

  afterEach(() => {
    removeSqliteSidecars(dbPath);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('removes sqlite sidecar files', () => {
    fs.writeFileSync(dbPath, 'db');
    fs.writeFileSync(`${dbPath}-wal`, 'wal');
    fs.writeFileSync(`${dbPath}-shm`, 'shm');

    removeSqliteSidecars(dbPath);

    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('backs up an existing database file before recreation', async () => {
    fs.writeFileSync(dbPath, 'corrupt-db');

    const result = await moveOrRemoveFileWithRetry(dbPath);

    expect(result).toBe('moved');
    expect(fs.existsSync(dbPath)).toBe(false);
    const backups = fs.readdirSync(tempDir).filter((name) => name.startsWith('1one.db.backup.'));
    expect(backups.length).toBe(1);
  });
});
