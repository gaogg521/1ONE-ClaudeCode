/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyFilesToDirectory } from '@process/utils/utils';

describe('copyFilesToDirectory', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map(async (root) => {
        await fs.rm(root, { recursive: true, force: true });
      })
    );
  });

  it('copies temp uploads into workspace and removes the temp source', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'one-copy-test-'));
    roots.push(root);

    const cacheDir = path.join(root, 'cache');
    const tempDir = path.join(cacheDir, 'temp');
    const workspace = path.join(root, 'workspace');
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(workspace, { recursive: true });

    const tempFile = path.join(tempDir, 'photo.png');
    await fs.writeFile(tempFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const copied = await copyFilesToDirectory(workspace, [tempFile], false, cacheDir);

    expect(copied).toHaveLength(1);
    expect(copied[0]).toBe(path.join(workspace, 'photo.png'));
    await expect(fs.access(copied[0])).resolves.toBeUndefined();
    await expect(fs.access(tempFile)).rejects.toThrow();
  });

  it('keeps files already inside the workspace without duplicating', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'one-copy-test-'));
    roots.push(root);

    const workspace = path.join(root, 'workspace');
    await fs.mkdir(workspace, { recursive: true });
    const inWorkspace = path.join(workspace, 'doc.pdf');
    await fs.writeFile(inWorkspace, Buffer.from('%PDF-1.4'));

    const copied = await copyFilesToDirectory(workspace, [inWorkspace]);

    expect(copied).toEqual([inWorkspace]);
    await expect(fs.access(inWorkspace)).resolves.toBeUndefined();
  });
});
