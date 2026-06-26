/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';

/**
 * Heuristic for model ids that are known to be natively multimodal (vision-capable).
 * Used only as a soft fallback when a provider has no explicit `vision` capability tag.
 */
const VISION_MODEL_HINT =
  /vision|[-_]vl\b|\bvl[-_]|gpt-?4o|gpt-?4\.1|gpt-?5|\bo4\b|gemini|claude-3|claude-4|glm-4v|qwen[\d.]*-?vl|pixtral|llava|internvl|minicpm-v|step-1v|kimi-(?:latest|k2[.-]?[5-9]|thinking)|moonshot.*vision|doubao.*vision/i;

/** True when the model id looks like a natively-multimodal model. */
export function modelLooksMultimodal(modelId: string | undefined): boolean {
  return VISION_MODEL_HINT.test(modelId || '');
}

function providerHasVisionTag(p: IProvider): boolean {
  return !!p.capabilities?.some((c) => c.type === 'vision' && c.isUserSelected !== false);
}

function pickVisionModel(p: IProvider): string | undefined {
  const models = (p.model || []).filter((m) => p.modelEnabled?.[m] !== false);
  // Prefer a model id that looks multimodal; otherwise the provider's first model
  // (the vision capability is provider-level, so any of its models qualifies).
  return models.find((m) => modelLooksMultimodal(m)) ?? models[0];
}

function isSameModel(a: TProviderWithModel | undefined, providerId: string, useModel: string): boolean {
  return !!a && a.id === providerId && a.useModel === useModel;
}

/**
 * Resolve a vision-capable model from the user's configured providers, to describe
 * images/scanned pages when the active chat model cannot. Selection order:
 *   1) a provider explicitly tagged with the `vision` capability;
 *   2) a provider whose model id matches the multimodal name heuristic.
 * The `exclude` model (usually the active chat model) is skipped so we don't just
 * re-pick the model that already failed. Returns undefined when none is configured.
 */
export async function resolveFallbackVisionModel(
  exclude?: TProviderWithModel
): Promise<TProviderWithModel | undefined> {
  const providers = (await ProcessConfig.get('model.config').catch((): IProvider[] => [])) as IProvider[];
  if (!Array.isArray(providers) || providers.length === 0) return undefined;

  const usable = providers.filter((p) => p.enabled !== false && !!p.apiKey);

  for (const p of usable) {
    if (!providerHasVisionTag(p)) continue;
    const useModel = pickVisionModel(p);
    if (useModel && !isSameModel(exclude, p.id, useModel)) {
      return { ...p, useModel } as TProviderWithModel;
    }
  }

  for (const p of usable) {
    const useModel = (p.model || []).find((m) => p.modelEnabled?.[m] !== false && modelLooksMultimodal(m));
    if (useModel && !isSameModel(exclude, p.id, useModel)) {
      return { ...p, useModel } as TProviderWithModel;
    }
  }

  return undefined;
}
