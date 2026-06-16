/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Models that accept image inputs on the chat API (native multimodal / vision). */
const NATIVE_VISION_MODEL_PATTERNS: RegExp[] = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-5/i,
  /claude-3|claude-4|claude-opus-4|claude-sonnet-4|claude-haiku-4/i,
  /gemini-2[\d.]/i,
  /gemini-.*-(pro|flash)/i,
  /qwen-vl|qwen2-vl|qwen2\.5-vl|qwen3-vl/i,
  /qwen-?3/i,
  /qwen3/i,
  /qwen-?3-7|qwen3-7|qwen-3\.7/i,
  /kimi-k2|kimi-k[\d.-]|moonshot-v1|moonshot-kimi/i,
  /doubao.*vision|seed.*vision/i,
  /llava|vision/i,
];

const NATIVE_VISION_EXCLUSIONS: RegExp[] = [/embed|rerank|dall-e|flux|stable-diffusion|text-embedding/i];

function normalizeModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9./_-]/g, '-')
    .replace(/-+/g, '-');
}

/** Whether the model can analyze user images via native multimodal input (not a separate vision tool). */
export function modelSupportsNativeVision(modelId: string | undefined): boolean {
  if (!modelId?.trim()) {
    return false;
  }
  const normalized = normalizeModelId(modelId);
  if (NATIVE_VISION_EXCLUSIONS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return NATIVE_VISION_MODEL_PATTERNS.some((pattern) => pattern.test(normalized));
}
