/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { getSystemDir } from '@process/utils/initStorage';
import { getAgentToolkitConfig } from './config';

/**
 * Whether to auto-initialize CodeGraph for this workspace.
 * Skips ephemeral temp workspaces under the app workDir.
 */
export async function shouldAutoInitCodegraph(
  workspace: string,
  customWorkspace?: boolean,
  workDirOverride?: string
): Promise<boolean> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled || !toolkit.codegraphEnabled || !toolkit.codegraphAutoIndex) {
    return false;
  }
  if (!customWorkspace) {
    return false;
  }
  const resolved = path.resolve(workspace);
  const workDir = path.resolve(workDirOverride ?? getSystemDir().workDir);
  if (resolved.startsWith(workDir) && /-temp-\d+/.test(resolved)) {
    return false;
  }
  return true;
}
