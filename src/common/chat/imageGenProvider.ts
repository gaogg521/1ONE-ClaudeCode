/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { modelSupportsNativeVision } from '@/common/chat/modelVision';

const IMAGE_GENERATION_ONLY_PATTERNS = /dall-e|flux|stable-diffusion|midjourney|imagen.*generate|gpt-image/i;

export function isImageGenerationOnlyModel(modelId: string | undefined): boolean {
  if (!modelId?.trim()) {
    return false;
  }
  return IMAGE_GENERATION_ONLY_PATTERNS.test(modelId);
}

function readEnvProvider(prefix: 'ONE_IMG' | 'ONE_CONV'): TProviderWithModel | null {
  const platform = process.env[`${prefix}_PLATFORM`];
  const model = process.env[`${prefix}_MODEL`];
  if (!platform || !model) {
    return null;
  }
  return {
    id: prefix === 'ONE_IMG' ? 'builtin-image-gen' : 'conversation-fallback',
    name: prefix === 'ONE_IMG' ? 'one-image-generation' : 'conversation-model',
    platform,
    baseUrl: process.env[`${prefix}_BASE_URL`] || '',
    apiKey: process.env[`${prefix}_API_KEY`] || '',
    useModel: model,
  };
}

/** Pick image-gen MCP provider; prefer chat vision model when analyzing screenshots. */
export function resolveImageGenProvider(forAnalysis: boolean): TProviderWithModel | null {
  const imageProvider = readEnvProvider('ONE_IMG');
  const conversationProvider = readEnvProvider('ONE_CONV');

  if (forAnalysis && conversationProvider && modelSupportsNativeVision(conversationProvider.useModel)) {
    const imageIsVision =
      imageProvider &&
      modelSupportsNativeVision(imageProvider.useModel) &&
      !isImageGenerationOnlyModel(imageProvider.useModel);
    if (!imageIsVision) {
      return conversationProvider;
    }
  }

  return imageProvider ?? conversationProvider;
}
