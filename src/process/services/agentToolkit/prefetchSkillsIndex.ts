/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpSkillManager } from '@process/task/AcpSkillManager';
import { getAgentToolkitConfig } from './config';

let prefetchPromise: Promise<void> | null = null;

/**
 * Warm the skills filesystem index so first-message injection does not block on discovery.
 */
export function prefetchAgentToolkitSkillsIndex(): void {
  if (prefetchPromise) {
    return;
  }

  prefetchPromise = (async () => {
    const toolkit = await getAgentToolkitConfig();
    if (!toolkit.enabled) {
      return;
    }
    const skillManager = AcpSkillManager.getInstance();
    await skillManager.discoverSkills();
  })().catch((error) => {
    console.warn('[agentToolkit] prefetchSkillsIndex failed:', error);
  });
}
