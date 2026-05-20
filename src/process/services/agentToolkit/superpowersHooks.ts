/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getAutoSkillsDir } from '@process/utils/initStorage';

let cachedContext: string | null | undefined;

/**
 * Superpowers SessionStart hook equivalent — inject using-superpowers on first turn.
 */
export async function getSuperpowersSessionContext(): Promise<string | null> {
  if (cachedContext !== undefined) {
    return cachedContext;
  }

  const skillPath = path.join(getAutoSkillsDir(), 'using-superpowers', 'SKILL.md');
  if (!existsSync(skillPath)) {
    cachedContext = null;
    return null;
  }

  try {
    const content = await fs.readFile(skillPath, 'utf-8');
    cachedContext = `## Superpowers (1ONE bundled)

You have Superpowers skills installed. **Invoke relevant skills before acting** (see using-superpowers below).

${content}`;
    return cachedContext;
  } catch {
    cachedContext = null;
    return null;
  }
}

export function clearSuperpowersSessionContextCache(): void {
  cachedContext = undefined;
}
