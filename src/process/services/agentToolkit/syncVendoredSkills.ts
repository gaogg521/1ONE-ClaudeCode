/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readdirSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { copyDirectoryRecursively, getConfigPath } from '@process/utils/utils';
import { getAgentToolkitVendorBuiltinDir } from './constants';

function getRuntimeAutoSkillsDir(): string {
  return path.join(getConfigPath(), 'builtin-skills', '_builtin');
}

/**
 * Merge vendored _builtin skills (from build script) into the live auto-skills dir under config/.
 */
export async function syncVendoredBuiltinSkills(): Promise<void> {
  const vendorDir = getAgentToolkitVendorBuiltinDir();
  if (!existsSync(vendorDir)) {
    return;
  }

  const autoSkillsDir = getRuntimeAutoSkillsDir();
  await fs.mkdir(autoSkillsDir, { recursive: true });

  const entries = readdirSync(vendorDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    const source = path.join(vendorDir, entry.name);
    const target = path.join(autoSkillsDir, entry.name);
    try {
      await copyDirectoryRecursively(source, target, { overwrite: true });
    } catch (error) {
      console.warn(`[agentToolkit] Failed to sync vendored skill ${entry.name}:`, error);
    }
  }
}
