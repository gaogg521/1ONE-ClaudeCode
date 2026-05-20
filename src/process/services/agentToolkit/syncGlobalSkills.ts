/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readdirSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getAutoSkillsDir } from '@process/utils/initStorage';
import { getAgentToolkitConfig } from './config';

const GLOBAL_SKILL_HOME_DIRS = [
  '.copilot/skills',
  '.opencode/skills',
  '.config/opencode/skills',
  '.agents/skills',
  '.gemini/skills',
] as const;

async function symlinkSkill(source: string, target: string): Promise<void> {
  try {
    await fs.lstat(target);
    return;
  } catch {
    // target missing — create symlink
  }
  await fs.symlink(source, target, 'junction');
}

/**
 * Symlink bundled _builtin skills into global CLI skill homes so agents without
 * workspace symlinks (e.g. Copilot, OpenCode) still discover Superpowers/find-skills.
 */
export async function syncGlobalAgentToolkitSkills(): Promise<void> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled) {
    return;
  }

  const sourceDir = getAutoSkillsDir();
  if (!existsSync(sourceDir)) {
    return;
  }

  const homedir = os.homedir();
  const skillNames = readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (skillNames.length === 0) {
    return;
  }

  for (const rel of GLOBAL_SKILL_HOME_DIRS) {
    const targetRoot = path.join(homedir, rel);
    try {
      await fs.mkdir(targetRoot, { recursive: true });
    } catch (error) {
      console.warn(`[agentToolkit] Failed to create global skills dir ${targetRoot}:`, error);
      continue;
    }

    for (const skillName of skillNames) {
      const source = path.join(sourceDir, skillName);
      const target = path.join(targetRoot, skillName);
      try {
        await symlinkSkill(source, target);
      } catch (error) {
        console.warn(`[agentToolkit] Failed to symlink ${skillName} -> ${target}:`, error);
      }
    }
  }

  console.log(`[agentToolkit] Synced ${skillNames.length} builtin skills to global CLI homes`);
}
