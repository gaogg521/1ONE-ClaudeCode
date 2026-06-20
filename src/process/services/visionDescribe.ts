/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import type { TProviderWithModel } from '@/common/config/storage';
import { isImageFilePath } from '@/common/chat/messageFiles';
import { isProviderLiteLlmProxy } from '@/common/utils/litellmGateway';

/**
 * Describe images as text by calling the user's configured vision-capable model.
 *
 * Why: aionrs backend passes file paths as text context and explicitly tells
 * the agent not to read binary/image files (envBuilder). So images uploaded to
 * an aionrs conversation are invisible to the model. This service calls the
 * model's vision API directly (using the same apiKey/baseUrl/model the user
 * configured for aionrs) to generate a text description, which is then injected
 * into the prompt so the agent can "see" the image content as text.
 *
 * Supported providers:
 * - OpenAI-compatible (kimi, doubao, qwen, deepseek, LiteLLM, etc.):
 *   POST {baseUrl}/v1/chat/completions with image_url content blocks
 * - Anthropic: POST {baseUrl}/v1/messages with image base64 source blocks
 *
 * Non-vision models / failures return null — callers should handle gracefully.
 */

const VISION_TIMEOUT_MS = 30_000;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — most vision APIs cap here

type ProviderType = 'openai' | 'anthropic' | 'bedrock' | 'gemini' | 'unknown';

function resolveProviderType(model: TProviderWithModel): ProviderType {
  if (model.platform === 'gemini' && !isProviderLiteLlmProxy(model)) return 'gemini';
  if (model.platform === 'bedrock') return 'bedrock';
  if (model.platform === 'anthropic' || model.platform === 'claude') return 'anthropic';
  // LiteLLM proxy / custom OpenAI-compatible endpoints all use OpenAI format
  return 'openai';
}

function stripTrailingV1(url: string): string {
  return url.replace(/\/v1\/?$/, '');
}

/**
 * Generate a text description for a single image file using the configured model.
 * Returns null if the model lacks vision support or the call fails.
 */
export async function describeImage(
  imagePath: string,
  model: TProviderWithModel
): Promise<string | null> {
  if (!isImageFilePath(imagePath)) return null;
  if (!model.apiKey || !model.useModel) return null;

  try {
    const buffer = await fs.readFile(imagePath);
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      // Skip oversized images rather than failing the whole send
      return `[Image ${path.basename(imagePath)} too large for vision description (${Math.round(buffer.length / 1024 / 1024)}MB)]`;
    }

    const providerType = resolveProviderType(model);
    const base64 = buffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType =
      ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : ext === '.bmp' ? 'image/bmp'
      : 'image/jpeg';

    switch (providerType) {
      case 'anthropic':
        return await describeWithAnthropic(base64, mimeType, model);
      case 'openai':
      case 'gemini': // Gemini via OpenAI-compatible proxy (LiteLLM) uses OpenAI format
        return await describeWithOpenAI(base64, mimeType, model);
      case 'bedrock':
        // Bedrock vision requires AWS SDK + region config — too heavy for inline.
        // Fall back to null; caller will show the "not supported" warning.
        return null;
      default:
        return null;
    }
  } catch (error) {
    console.warn(`[visionDescribe] Failed to describe ${imagePath}:`, error);
    return null;
  }
}

/**
 * Describe all images in a file list, returning a combined text block.
 * Non-image files are passed through unchanged (returned in the remaining list).
 */
export async function describeImagesForPrompt(
  filePaths: string[],
  model: TProviderWithModel
): Promise<{ imageDescriptionBlock: string; nonImageFiles: string[] }> {
  const imagePaths: string[] = [];
  const nonImageFiles: string[] = [];
  for (const f of filePaths) {
    if (isImageFilePath(f)) imagePaths.push(f);
    else nonImageFiles.push(f);
  }

  if (imagePaths.length === 0) {
    return { imageDescriptionBlock: '', nonImageFiles };
  }

  const descriptions: string[] = [];
  for (const imgPath of imagePaths) {
    const desc = await describeImage(imgPath, model);
    if (desc) {
      descriptions.push(`[Image: ${path.basename(imgPath)}]\n${desc}`);
    } else {
      descriptions.push(
        `[Image: ${path.basename(imgPath)} — vision description unavailable. The model cannot see this image.]`
      );
    }
  }

  const imageDescriptionBlock = `\n\n[Image descriptions (auto-generated via vision API)]:\n${descriptions.join('\n\n')}\n`;
  return { imageDescriptionBlock, nonImageFiles };
}

async function describeWithOpenAI(
  base64: string,
  mimeType: string,
  model: TProviderWithModel
): Promise<string | null> {
  const baseUrl = stripTrailingV1(model.baseUrl || 'https://api.openai.com');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.useModel,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image concisely. Focus on text content (OCR), key visual elements, and context relevant to understanding what the user is asking about. Reply in the same language as any text visible in the image.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[visionDescribe] OpenAI vision API returned ${res.status}`);
      return null;
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content?.trim() || null;
  } finally {
    clearTimeout(timer);
  }
}

async function describeWithAnthropic(
  base64: string,
  mimeType: string,
  model: TProviderWithModel
): Promise<string | null> {
  const baseUrl = stripTrailingV1(model.baseUrl || 'https://api.anthropic.com');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': model.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model.useModel,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64 },
              },
              {
                type: 'text',
                text: 'Describe this image concisely. Focus on text content (OCR), key visual elements, and context relevant to understanding what the user is asking about. Reply in the same language as any text visible in the image.',
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[visionDescribe] Anthropic vision API returned ${res.status}`);
      return null;
    }

    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = body.content?.find((c) => c.type === 'text');
    return textBlock?.text?.trim() || null;
  } finally {
    clearTimeout(timer);
  }
}
