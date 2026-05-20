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
} from '@process/task/agentUtils';
import { getAgentToolkitConfig } from './config';
import { getSuperpowersSessionContext } from './superpowersHooks';

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
  options: { backend?: string; customWorkspace?: boolean; fullSkillContent?: boolean }
): Promise<string> {
  const toolkit = await getAgentToolkitConfig();
  if (!toolkit.enabled) {
    return content;
  }

  let result = content;
  const useSkillsIndex = await shouldInjectSkillsIndex(options.backend, options.customWorkspace);
  const nativeOnlyRules =
    hasNativeSkillSupport(options.backend) &&
    !options.customWorkspace &&
    !toolkit.injectSkillsForAllAgents;

  if (useSkillsIndex) {
    result = await prepareFirstMessageWithSkillsIndex(result, config);
  } else if (nativeOnlyRules && config.presetContext) {
    result = await prepareFirstMessage(result, { presetContext: config.presetContext });
  } else if (!nativeOnlyRules && (config.presetContext || (config.enabledSkills?.length ?? 0) > 0)) {
    if (options.fullSkillContent) {
      result = await prepareFirstMessage(result, config);
    } else {
      result = await prepareFirstMessageWithSkillsIndex(result, config);
    }
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
