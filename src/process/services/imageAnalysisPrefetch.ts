/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { executeImageGeneration } from '@/common/chat/imageGenCore';
import { isImageGenerationOnlyModel } from '@/common/chat/imageGenProvider';
import { modelSupportsNativeVision } from '@/common/chat/modelVision';
import { wrapSystemReminder } from '@/common/chat/systemReminder';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';

export const IMAGE_ANALYSIS_CONTEXT_TAG = '1one-image-analysis';
export const IMAGE_ANALYSIS_FAILED_TAG = '1one-image-analysis-failed';

/** Models that reject multimodal chat input for screenshot analysis (gateway-specific). */
const IMAGE_PREFETCH_AVOID_PATTERNS: RegExp[] = [
  /qwen-?3-?7|qwen3-?7/i,
  /minimax/i,
  /seed.*thinking|reasoner/i,
];

/** Prefer stable vision backends when multiple models share one gateway. */
const VISION_MODEL_PREFERENCE: string[] = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'qwen-3-6-plus',
  'gpt-4o',
  'gpt-5-4',
  'kimi-k2-6',
  'kimi-k2.5',
];

function modelAvoidsImagePrefetch(modelId: string | undefined): boolean {
  if (!modelId?.trim()) return true;
  return IMAGE_PREFETCH_AVOID_PATTERNS.some((pattern) => pattern.test(modelId));
}

function visionModelRank(modelId: string): number {
  const idx = VISION_MODEL_PREFERENCE.indexOf(modelId);
  return idx >= 0 ? idx : VISION_MODEL_PREFERENCE.length + modelId.length;
}

function sortVisionModelIds(modelIds: string[]): string[] {
  return [...modelIds].sort((a, b) => visionModelRank(a) - visionModelRank(b));
}

function isUsablePrefetchModel(modelId: string | undefined): boolean {
  return (
    Boolean(modelId?.trim()) &&
    modelSupportsNativeVision(modelId) &&
    !isImageGenerationOnlyModel(modelId) &&
    !modelAvoidsImagePrefetch(modelId)
  );
}

/** Strip image-gen wrapper text; keep substantive model analysis. */
export function extractImageAnalysisBody(raw: string): string {
  const trimmed = raw.trim();
  const modelResponseMatch = trimmed.match(/Model response:\s*([\s\S]+)/i);
  if (modelResponseMatch?.[1]?.trim()) {
    return modelResponseMatch[1].trim();
  }
  if (/^Image generation did not produce any images/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

export function extractImageAnalysisFailureMessage(prompt: string | undefined): string | null {
  if (!prompt) return null;
  const re = new RegExp(`<${IMAGE_ANALYSIS_FAILED_TAG}>\\s*([\\s\\S]*?)\\s*</${IMAGE_ANALYSIS_FAILED_TAG}>`);
  const match = prompt.match(re);
  return match?.[1]?.trim() ?? null;
}

function mergeProviderCredentials(
  primary: TProviderWithModel | (IProvider & { useModel?: string }),
  fallback?: TProviderWithModel
): TProviderWithModel {
  return {
    ...(fallback ?? primary),
    ...primary,
    baseUrl: primary.baseUrl || fallback?.baseUrl || '',
    apiKey: primary.apiKey || fallback?.apiKey || '',
    useModel: primary.useModel || fallback?.useModel || '',
  } as TProviderWithModel;
}

/** Runtime gateway may still carry `model[]` even though TProviderWithModel omits it in types. */
type ConversationModelWithGateway = TProviderWithModel & { model?: string[] };

function getGatewayModelList(conversationModel: TProviderWithModel): string[] | null {
  const extra = conversationModel as ConversationModelWithGateway;
  if (Array.isArray(extra.model) && extra.model.length > 0) {
    return extra.model;
  }
  return null;
}

async function findSameGatewayProvider(conversationModel: TProviderWithModel): Promise<IProvider | null> {
  const providers = (await ProcessConfig.get('model.config').catch((): IProvider[] => [])) || [];
  const fromConfig =
    providers.find((p) => p.id === conversationModel.id) ??
    providers.find((p) => p.baseUrl === conversationModel.baseUrl && p.apiKey === conversationModel.apiKey);
  if (fromConfig) {
    return fromConfig;
  }
  const modelList = getGatewayModelList(conversationModel);
  if (modelList) {
    return { ...conversationModel, model: modelList } as IProvider;
  }
  return null;
}

/** Pick vision models on the same gateway, preferring stable analyzers over the chat model. */
export function listGatewayVisionModels(gateway: IProvider, excludeChatModel?: string): TProviderWithModel[] {
  const names = Array.isArray(gateway.model) ? gateway.model : [];
  const visionModels = sortVisionModelIds(
    names.filter((name) => isUsablePrefetchModel(name))
  );
  if (visionModels.length === 0) {
    return [];
  }
  const alternates = visionModels.filter((name) => name !== excludeChatModel);
  const ordered = alternates.length > 0 ? alternates : visionModels;
  return ordered.map((useModel) => ({ ...gateway, useModel }) as TProviderWithModel);
}

/** @deprecated Use listGatewayVisionModels — kept for unit tests. */
export function pickGatewayVisionModel(gateway: IProvider, excludeChatModel?: string): TProviderWithModel | null {
  return listGatewayVisionModels(gateway, excludeChatModel)[0] ?? null;
}

export function buildImageAnalysisUnavailableBlock(reason?: string): string {
  const detail = reason?.trim() || 'No vision-capable model is configured for image analysis.';
  return (
    `<${IMAGE_ANALYSIS_FAILED_TAG}>\n` +
    `${detail}\n` +
    `</${IMAGE_ANALYSIS_FAILED_TAG}>\n\n` +
    wrapSystemReminder(
      'Image analysis is unavailable. Tell the user clearly in their language. ' +
        'Do NOT call one_image_generation, ReadFile, or any other tools for this turn.'
    )
  );
}

export function agentPromptHasPrefetchedImageAnalysis(prompt: string | undefined): boolean {
  return Boolean(prompt?.includes(`<${IMAGE_ANALYSIS_CONTEXT_TAG}>`));
}

export function agentPromptHasImageAnalysisFailure(prompt: string | undefined): boolean {
  return Boolean(prompt?.includes(`<${IMAGE_ANALYSIS_FAILED_TAG}>`));
}

/**
 * Ordered vision providers for screenshot pre-analysis (first success wins downstream).
 * Priority: settings image model → gateway vision models → chat model (if usable).
 */
export async function listVisionAnalysisProviders(
  conversationModel?: TProviderWithModel
): Promise<TProviderWithModel[]> {
  const chatModelId = conversationModel?.useModel?.trim();
  const candidates: TProviderWithModel[] = [];

  const configured = await ProcessConfig.get('tools.imageGenerationModel').catch((): undefined => undefined);
  if (configured?.apiKey?.trim() && configured?.useModel?.trim() && isUsablePrefetchModel(configured.useModel)) {
    candidates.push(mergeProviderCredentials(configured, conversationModel));
  }

  if (conversationModel?.apiKey?.trim()) {
    const gateway = await findSameGatewayProvider(conversationModel);
    if (gateway) {
      candidates.push(...listGatewayVisionModels(gateway, chatModelId));
    }
  }

  if (
    conversationModel?.apiKey?.trim() &&
    conversationModel.useModel?.trim() &&
    isUsablePrefetchModel(conversationModel.useModel)
  ) {
    candidates.push(conversationModel);
  }

  const seen = new Set<string>();
  const unique: TProviderWithModel[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.baseUrl}::${candidate.useModel}`;
    if (seen.has(key) || !candidate.apiKey?.trim() || !candidate.useModel?.trim()) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

/** Resolve a vision-capable provider for screenshot pre-analysis. */
export async function resolveVisionAnalysisProvider(
  conversationModel?: TProviderWithModel
): Promise<TProviderWithModel | null> {
  const providers = await listVisionAnalysisProviders(conversationModel);
  return providers[0] ?? null;
}

/**
 * Pre-analyze user images in the main process so aionrs does not rely on the model
 * calling one_image_generation or ReadFile (which often mis-reads unrelated files).
 */
export async function buildPrefetchedImageAnalysisBlock(input: {
  imagePaths: string[];
  userQuestion: string;
  workspaceDir: string;
  conversationModel?: TProviderWithModel;
}): Promise<string> {
  if (input.imagePaths.length === 0 || !input.workspaceDir.trim()) {
    return '';
  }

  const providers = await listVisionAnalysisProviders(input.conversationModel);
  if (providers.length === 0) {
    return buildImageAnalysisUnavailableBlock();
  }

  const analyzePrompt = input.userQuestion.trim()
    ? `Analyze image: User question (reply in the same language as the question): ${input.userQuestion}`
    : 'Analyze image: Describe all visible text, terminal output, UI elements, and errors in this screenshot.';

  let lastError = 'unknown error';
  for (const provider of providers) {
    const result = await executeImageGeneration(
      { prompt: analyzePrompt, image_uris: input.imagePaths },
      provider,
      input.workspaceDir
    );

    if (!result.success) {
      lastError = result.text.trim() || result.error || lastError;
      continue;
    }

    const body = extractImageAnalysisBody(result.text);
    if (!body) {
      lastError = 'Image pre-analysis returned no usable description.';
      continue;
    }

    return (
      `<${IMAGE_ANALYSIS_CONTEXT_TAG}>\n` +
      `Pre-analyzed image content (ground truth — do NOT guess or read other files):\n\n${body}\n` +
      `</${IMAGE_ANALYSIS_CONTEXT_TAG}>\n\n` +
      wrapSystemReminder(
        'Screenshot/image content is pre-analyzed above. Answer ONLY from that analysis in plain text. ' +
          'Do NOT call ANY tools (one_image_generation, ReadFile, bash, MCP). ' +
          'Do NOT invent content that is not in the analysis block.'
      )
    );
  }

  return (
    `<${IMAGE_ANALYSIS_FAILED_TAG}>\n` +
    `Image pre-analysis failed: ${lastError}\n` +
    `</${IMAGE_ANALYSIS_FAILED_TAG}>\n\n` +
    wrapSystemReminder(
      'Image analysis failed upstream. Tell the user clearly in their language what went wrong. ' +
        'Do NOT call one_image_generation, ReadFile, or any other tools for this turn.'
    )
  );
}
