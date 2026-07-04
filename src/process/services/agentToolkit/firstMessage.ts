/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { hasNativeSkillSupport } from '@/common/types/acpTypes';
import {
  type FirstMessageConfig,
  prepareFirstMessage,
  prepareFirstMessageWithSkillsIndex,
  prepareSkillsIndexRefresh,
} from '@process/task/agentUtils';
import { getAgentToolkitConfig } from './config';
import { getSuperpowersSessionContext } from './superpowersHooks';

/**
 * 每多少条用户消息做一次轻量技能索引刷新（仅索引注入路径的 backend 生效）。
 * How many user messages between lightweight skills-index refreshes
 * (only applies to backends on the index-injection path).
 */
export const SKILLS_INDEX_REFRESH_INTERVAL = 20;

export async function shouldInjectSkillsIndex(
  backend: string | undefined,
  customWorkspace?: boolean
): Promise<boolean> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled) {
    return false;
  }
  if (toolkit.injectSkillsForAllAgents) {
    return true;
  }
  if (customWorkspace) {
    return true;
  }
  return !hasNativeSkillSupport(backend);
}

function prependRulesBlock(existing: string, block: string): string {
  const marker = '[User Request]';
  if (existing.includes(marker)) {
    return existing.replace(
      marker,
      `${block}\n\n${marker}`
    );
  }
  return `[Assistant Rules - You MUST follow these instructions]\n${block}\n\n[User Request]\n${existing}`;
}

/**
 * Apply agent toolkit to the first user message (skills index + Superpowers session context).
 */
export async function applyAgentToolkitFirstMessage(
  content: string,
  config: FirstMessageConfig,
  options: { backend?: string; customWorkspace?: boolean }
): Promise<string> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled) {
    return content;
  }

  let result = content;
  const useSkillsIndex = await shouldInjectSkillsIndex(options.backend, options.customWorkspace);

  if (useSkillsIndex) {
    result = await prepareFirstMessageWithSkillsIndex(result, config);
  } else if (config.presetContext) {
    // Backend discovers skills natively — only assistant rules need injection.
    result = await prepareFirstMessage(result, { presetContext: config.presetContext });
  }

  if (toolkit.superpowersHooksEnabled) {
    const superpowersContext = await getSuperpowersSessionContext();
    if (superpowersContext) {
      if (result.includes('[Assistant Rules')) {
        result = prependRulesBlock(result, superpowersContext);
      } else {
        result = `[Assistant Rules - You MUST follow these instructions]\n${superpowersContext}\n\n[User Request]\n${result}`;
      }
    }
  }

  return result;
}

/**
 * Mid-session lightweight skills-index refresh (index only, no rules).
 * Returns null when not applicable: toolkit disabled, or the backend
 * discovers skills natively (no index injection to refresh).
 */
export async function applyAgentToolkitIndexRefresh(
  content: string,
  config: FirstMessageConfig,
  options: { backend?: string; customWorkspace?: boolean }
): Promise<string | null> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled) {
    return null;
  }
  const useSkillsIndex = await shouldInjectSkillsIndex(options.backend, options.customWorkspace);
  if (!useSkillsIndex) {
    return null;
  }
  return prepareSkillsIndexRefresh(content, config);
}
