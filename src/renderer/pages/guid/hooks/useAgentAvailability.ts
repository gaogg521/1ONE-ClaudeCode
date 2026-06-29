/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AvailableAgent, EffectiveAgentInfo, PresetAgentType } from '../types';
import { useCallback } from 'react';

type UseAgentAvailabilityOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  availableAgents: AvailableAgent[] | undefined;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string;
  /** Current selected model — used to route preset assistants by protocol.
   *  Google Gemini/Vertex → gemini; OpenAI-compatible (custom/new-api/anthropic/bedrock) → aionrs. */
  currentModel?: TProviderWithModel | undefined;
};

type UseAgentAvailabilityResult = {
  isMainAgentAvailable: (agentType: string) => boolean;
  getAvailableFallbackAgent: () => string | null;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
};

/**
 * Hook that provides agent availability checking logic.
 * Determines whether agents are available and provides fallback resolution.
 */
export const useAgentAvailability = ({
  modelList,
  isGoogleAuth,
  availableAgents,
  resolvePresetAgentType,
  currentModel,
}: UseAgentAvailabilityOptions): UseAgentAvailabilityResult => {
  const isMainAgentAvailable = useCallback(
    (agentType: string): boolean => {
      if (agentType === 'gemini') {
        return isGoogleAuth || (modelList != null && modelList.length > 0);
      }
      if (agentType === 'aionrs') {
        // aionrs is the built-in bundled engine — always available (binary ships with the app).
        return true;
      }
      return availableAgents?.some((agent) => agent.backend === agentType) ?? false;
    },
    [modelList, availableAgents, isGoogleAuth]
  );

  const getAvailableFallbackAgent = useCallback((): string | null => {
    // aionrs first (bundled, always available), gemini last (needs Google OAuth,
    // routing OpenAI-protocol users there is what caused the original hang).
    const fallbackOrder: PresetAgentType[] = ['gemini', 'claude', 'qwen', 'codex', 'codebuddy', 'opencode'];
    const ordered = ['aionrs', ...fallbackOrder];
    for (const agentType of ordered) {
      if (isMainAgentAvailable(agentType)) {
        return agentType;
      }
    }
    return null;
  }, [isMainAgentAvailable]);

  const getEffectiveAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): EffectiveAgentInfo => {
      const originalType = resolvePresetAgentType(agentInfo);
      // Route preset assistants by the current model's protocol instead of the
      // hardcoded presetAgentType. OpenAI-protocol models (deepseek/kimi/qwen/
      // doubao via custom/new-api/anthropic/bedrock) go to aionrs — the stable
      // bundled engine. Only Google Gemini/Vertex models stay on gemini (which
      // needs Google OAuth). This prevents the gemini-branch hang when users on
      // OpenAI-protocol models open preset assistants.
      let effectiveType = originalType;
      if (originalType === 'gemini') {
        const platform = currentModel?.platform;
        const isGoogleModel = platform === 'gemini' || platform === 'gemini-vertex-ai';
        effectiveType = isGoogleModel ? 'gemini' : 'aionrs';
      }
      const isAvailable = isMainAgentAvailable(effectiveType);
      return { agentType: effectiveType, isFallback: effectiveType !== originalType, originalType, isAvailable };
    },
    [resolvePresetAgentType, isMainAgentAvailable, currentModel]
  );

  return {
    isMainAgentAvailable,
    getAvailableFallbackAgent,
    getEffectiveAgentType,
  };
};
