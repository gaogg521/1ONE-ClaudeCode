/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared image generation logic used by both:
 * - The built-in MCP server (imageGenServer.ts)
 * - The legacy Gemini-specific tool (img-gen.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonrepair } from 'jsonrepair';
import type OpenAI from 'openai';
import { ClientFactory, type RotatingClient } from '@/common/api/ClientFactory';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import type { TProviderWithModel } from '@/common/config/storage';
import type { UnifiedChatCompletionResponse } from '@/common/api/RotatingApiClient';
import { IMAGE_EXTENSIONS, MIME_TYPE_MAP, MIME_TO_EXT_MAP, DEFAULT_IMAGE_EXTENSION } from '@/common/config/constants';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { removeApiPathSuffix } from '@/common/utils/protocolDetector';

const API_TIMEOUT_MS = 120000; // 2 minutes for image generation API calls

type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

// ===== Utility Functions =====

export function safeJsonParse<T = unknown>(jsonString: string, fallbackValue: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallbackValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (_error) {
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson) as T;
    } catch (_repairError) {
      console.warn('[ImageGen] JSON parse failed:', jsonString.substring(0, 50));
      return fallbackValue;
    }
  }
}

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext as ImageExtension);
}

export function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

export async function fileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    return fileBuffer.toString('base64');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
      throw new Error(`Image file not found: ${filePath}`, { cause: error });
    }
    throw new Error(`Failed to read image file: ${errorMessage}`, { cause: error });
  }
}

export function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
}

export function getFileExtensionFromDataUrl(dataUrl: string): string {
  const mimeTypeMatch = dataUrl.match(/^data:image\/([^;]+);base64,/);
  if (mimeTypeMatch && mimeTypeMatch[1]) {
    const mimeType = mimeTypeMatch[1].toLowerCase();
    return MIME_TO_EXT_MAP[mimeType] || DEFAULT_IMAGE_EXTENSION;
  }
  return DEFAULT_IMAGE_EXTENSION;
}

export async function saveGeneratedImage(base64Data: string, workspaceDir: string): Promise<string> {
  const timestamp = Date.now();
  const fileExtension = getFileExtensionFromDataUrl(base64Data);
  const fileName = `img-${timestamp}${fileExtension}`;
  const filePath = path.join(workspaceDir, fileName);

  const base64WithoutPrefix = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');

  try {
    await fs.promises.writeFile(filePath, imageBuffer);
    return filePath;
  } catch (error) {
    console.error('[ImageGen] Failed to save image file:', error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

// ===== Image Content Processing =====

interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail: 'auto' | 'low' | 'high';
  };
}

export async function processImageUri(imageUri: string, workspaceDir: string): Promise<ImageContent | null> {
  if (isHttpUrl(imageUri)) {
    return {
      type: 'image_url',
      image_url: { url: imageUri, detail: 'auto' },
    };
  }

  let processedUri = imageUri;
  if (imageUri.startsWith('@')) {
    processedUri = imageUri.substring(1);
  }

  let fullPath = processedUri;
  if (!path.isAbsolute(processedUri)) {
    fullPath = path.join(workspaceDir, processedUri);
  }

  try {
    await fs.promises.access(fullPath, fs.constants.F_OK);

    if (!isImageFile(fullPath)) {
      throw new Error(`File is not a supported image type: ${fullPath}`);
    }

    const base64Data = await fileToBase64(fullPath);
    const mimeType = getImageMimeType(fullPath);
    return {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'auto' },
    };
  } catch (error) {
    const possiblePaths = [imageUri, path.join(workspaceDir, imageUri)].filter((p, i, arr) => arr.indexOf(p) === i);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Image file not found') || errorMessage.includes('not a supported image type')) {
      throw error;
    }

    throw new Error(
      `Image file not found. Searched paths:\n${possiblePaths.map((p) => `- ${p}`).join('\n')}\n\nPlease ensure the image file exists and has a valid image extension (.jpg, .png, .gif, .webp, etc.)`,
      { cause: error }
    );
  }
}

// ===== Core Execution =====

export interface ImageGenParams {
  prompt: string;
  image_uris?: string[] | string;
}

export interface ImageGenResult {
  success: boolean;
  text: string;
  imageDataUrl?: string;
  imagePath?: string;
  relativeImagePath?: string;
  error?: string;
}

function isLikelyImageGenerationModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return /(?:^|[-_/])(image|images)(?:$|[-_/])/.test(normalized) ||
    normalized.includes('dall-e') ||
    normalized.includes('gpt-image') ||
    normalized.includes('flux') ||
    normalized.includes('seedream') ||
    normalized.includes('stable-image') ||
    normalized.includes('imagen');
}

async function downloadImageAsDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function isLikelyGeminiNativeImageProvider(provider: TProviderWithModel): boolean {
  const model = provider.useModel?.trim().toLowerCase() || '';
  const baseUrl = provider.baseUrl?.trim().toLowerCase() || '';
  return model.includes('gemini') && isLikelyImageGenerationModel(model) && (baseUrl.includes('litellm') || baseUrl.includes('/gemini'));
}

function buildGeminiNativeEndpointCandidates(provider: TProviderWithModel): string[] {
  const baseUrl = provider.baseUrl?.trim().replace(/\/+$/, '') || '';
  const apiKey = provider.apiKey?.trim() || '';
  const model = provider.useModel?.trim() || '';
  if (!baseUrl || !apiKey || !model) return [];

  const roots = new Set<string>();
  const stripped = removeApiPathSuffix(baseUrl) || baseUrl.replace(/\/(v1beta|v1)$/i, '');

  if (/\/gemini(?:\/(v1beta|v1))?$/i.test(baseUrl)) {
    roots.add(baseUrl.replace(/\/(v1beta|v1)$/i, ''));
  }

  if (/\/gemini(?:\/(v1beta|v1))?$/i.test(stripped)) {
    roots.add(stripped.replace(/\/(v1beta|v1)$/i, ''));
  }

  roots.add(stripped.endsWith('/gemini') ? stripped : `${stripped}/gemini`);

  return [...roots]
    .map((root) => root.replace(/\/+$/, ''))
    .filter(Boolean)
    .map((root) => `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`);
}

function parseGeminiNativeImageResponse(response: unknown): {
  responseText: string;
  images?: Array<{ type: 'image_url'; image_url: { url: string } }>;
} {
  const candidate = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }> })
    ?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  let responseText = '';
  const images: Array<{ type: 'image_url'; image_url: { url: string } }> = [];

  for (const part of parts) {
    if (typeof part.text === 'string') {
      responseText += part.text;
    }
    if (part.inlineData?.mimeType && part.inlineData?.data) {
      images.push({
        type: 'image_url',
        image_url: {
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        },
      });
    }
  }

  return {
    responseText: responseText || 'Image generated successfully.',
    images,
  };
}

async function tryGeminiNativeImageEndpoint(
  provider: TProviderWithModel,
  prompt: string,
  hasImages: boolean,
  signal?: AbortSignal
): Promise<{ responseText: string; images?: Array<{ type: 'image_url'; image_url: { url: string } }> } | null> {
  if (hasImages) return null;
  if (!isLikelyGeminiNativeImageProvider(provider)) return null;

  const endpoints = buildGeminiNativeEndpointCandidates(provider);
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        }),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${responseText ? ` - ${responseText}` : ''}`);
      }

      const data = await response.json();
      return parseGeminiNativeImageResponse(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${endpoint} -> ${errorMessage}`);
    }
  }

  console.warn('[ImageGen] Gemini native image endpoint attempts failed:', errors);
  return null;
}

async function tryOpenAiImageEndpoint(
  rotatingClient: RotatingClient,
  provider: TProviderWithModel,
  prompt: string,
  hasImages: boolean,
  signal?: AbortSignal
): Promise<{ responseText: string; images?: Array<{ type: 'image_url'; image_url: { url: string } }> } | null> {
  if (hasImages) return null;
  if (!(rotatingClient instanceof OpenAIRotatingClient)) return null;
  if (getProviderAuthType(provider) !== 'openai') return null;
  if (!isLikelyImageGenerationModel(provider.useModel)) return null;

  const response = await rotatingClient.createImage(
    {
      model: provider.useModel,
      prompt,
    },
    { signal, timeout: API_TIMEOUT_MS }
  );

  const first = response.data?.[0];
  if (!first) {
    return { responseText: 'No response from image generation API', images: [] };
  }

  if (first.b64_json) {
    return {
      responseText: first.revised_prompt || 'Image generated successfully.',
      images: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${first.b64_json}` } }],
    };
  }

  if (first.url) {
    const dataUrl = await downloadImageAsDataUrl(first.url);
    return {
      responseText: first.revised_prompt || 'Image generated successfully.',
      images: [{ type: 'image_url', image_url: { url: dataUrl } }],
    };
  }

  return { responseText: first.revised_prompt || 'Image generated successfully.', images: [] };
}

/**
 * Core image generation function shared between MCP server and Gemini tool.
 */
export async function executeImageGeneration(
  params: ImageGenParams,
  provider: TProviderWithModel,
  workspaceDir: string,
  proxy?: string,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  if (signal?.aborted) {
    return { success: false, text: 'Image generation was cancelled.', error: 'cancelled' };
  }

  try {
    // Parse image URIs
    let imageUris: string[] = [];
    if (params.image_uris) {
      if (typeof params.image_uris === 'string') {
        const parsed = safeJsonParse<string[]>(params.image_uris, null);
        imageUris = Array.isArray(parsed) ? parsed : [params.image_uris];
      } else if (Array.isArray(params.image_uris)) {
        imageUris = params.image_uris;
      }
    }

    const hasImages = imageUris.length > 0;
    let enhancedPrompt: string;
    if (hasImages) {
      enhancedPrompt = `Analyze/Edit image: ${params.prompt}`;
    } else {
      enhancedPrompt = `Generate image: ${params.prompt}`;
    }

    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: enhancedPrompt }];

    // Process image URIs
    if (hasImages) {
      const imageResults = await Promise.allSettled(imageUris.map((uri) => processImageUri(uri, workspaceDir)));

      const successful: ImageContent[] = [];
      const errors: string[] = [];

      imageResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successful.push(result.value);
        } else {
          const error = result.status === 'rejected' ? result.reason : 'Unknown error';
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Image ${index + 1} (${imageUris[index]}): ${errorMessage}`);
        }
      });

      successful.forEach((imageContent) => contentParts.push(imageContent));

      if (successful.length === 0) {
        return {
          success: false,
          text: `Error: Failed to process any images. Errors:\n${errors.join('\n')}`,
          error: errors.join('\n'),
        };
      }
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'user', content: contentParts }];

    let responseText = 'Image generated successfully.';
    let images: UnifiedChatCompletionResponse['choices'][number]['message']['images'];
    let rotatingClient: RotatingClient | null = null;

    const geminiNativeResult = await tryGeminiNativeImageEndpoint(provider, enhancedPrompt, hasImages, signal).catch((error): null => {
      console.warn('[ImageGen] Gemini native image generation failed, falling back:', error);
      return null;
    });

    if (geminiNativeResult) {
      responseText = geminiNativeResult.responseText;
      images = geminiNativeResult.images;
    } else {
      // Create client and call API
      rotatingClient = await ClientFactory.createRotatingClient(provider, {
        proxy,
        rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
      });

      const imageEndpointResult = await tryOpenAiImageEndpoint(rotatingClient, provider, params.prompt, hasImages, signal).catch(
        (error): null => {
          console.warn('[ImageGen] images.generate failed, falling back to chat.completions:', error);
          return null;
        }
      );

      if (imageEndpointResult) {
        responseText = imageEndpointResult.responseText;
        images = imageEndpointResult.images;
      } else {
        const completion: UnifiedChatCompletionResponse = await rotatingClient.createChatCompletion(
          { model: provider.useModel, messages: messages as any },
          { signal, timeout: API_TIMEOUT_MS }
        );

        const choice = completion.choices[0];
        if (!choice) {
          return { success: false, text: 'No response from image generation API', error: 'No response' };
        }

        responseText = choice.message.content || 'Image generated successfully.';
        images = choice.message.images;
      }
    }

    // Extract images from markdown in content if not in images field
    if ((!images || images.length === 0) && responseText) {
      const dataUrlRegex = /!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
      const dataUrlMatches = [...responseText.matchAll(dataUrlRegex)];
      if (dataUrlMatches.length > 0) {
        images = dataUrlMatches.map((match) => ({
          type: 'image_url' as const,
          image_url: { url: match[1] },
        }));
      } else {
        const filePathRegex = /!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|gif|webp|bmp|tiff|svg))\)/gi;
        const filePathMatches = [...responseText.matchAll(filePathRegex)];
        if (filePathMatches.length > 0) {
          const processedImages: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
          for (const match of filePathMatches) {
            const filePath = match[1];
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceDir, filePath);
            try {
              await fs.promises.access(fullPath);
              const base64Data = await fileToBase64(fullPath);
              const mimeType = getImageMimeType(fullPath);
              processedImages.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Data}` },
              });
            } catch (_fileError) {
              console.warn(`[ImageGen] Could not load image file: ${filePath}`);
            }
          }
          if (processedImages.length > 0) {
            images = processedImages;
          }
        }
      }
    }

    if (!images || images.length === 0) {
      const warningMessage = `Image generation did not produce any images.\n\nModel response: ${responseText}\n\nTip: Make sure your image generation model supports this type of request. Current model: ${provider.useModel}`;
      return { success: true, text: warningMessage };
    }

    const firstImage = images[0];
    if (firstImage.type === 'image_url' && firstImage.image_url?.url) {
      const imagePath = await saveGeneratedImage(firstImage.image_url.url, workspaceDir);
      const relativeImagePath = path.relative(workspaceDir, imagePath);

      return {
        success: true,
        imageDataUrl: firstImage.image_url.url,
        text: `${responseText}\n\nGenerated image saved to: ${imagePath}`,
        imagePath,
        relativeImagePath,
      };
    }

    return { success: true, text: responseText };
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, text: 'Image generation was cancelled.', error: 'cancelled' };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ImageGen] API call failed:`, error);
    return { success: false, text: `Error generating image: ${errorMessage}`, error: errorMessage };
  }
}
