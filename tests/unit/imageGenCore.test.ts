/**
 * @license
 * Copyright 2025 1ONE ClaudeCode (1one-claudecode.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsModule from 'fs';
import { OpenAIRotatingClient } from '../../src/common/api/OpenAIRotatingClient';
import {
  safeJsonParse,
  isImageFile,
  isHttpUrl,
  getFileExtensionFromDataUrl,
  processImageUri,
  executeImageGeneration,
} from '../../src/common/chat/imageGenCore';

vi.mock('../../src/common/api/ClientFactory', () => ({
  ClientFactory: {
    createRotatingClient: vi.fn(),
  },
}));

import { ClientFactory } from '../../src/common/api/ClientFactory';

// ---------------------------------------------------------------------------
// safeJsonParse
// ---------------------------------------------------------------------------

describe('safeJsonParse', () => {
  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback');
  });

  it('returns fallback for non-string input', () => {
    expect(safeJsonParse(null as unknown as string, 42)).toBe(42);
  });

  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  it('parses a valid JSON array', () => {
    expect(safeJsonParse('["img1.png","img2.jpg"]', [])).toEqual(['img1.png', 'img2.jpg']);
  });

  it('repairs and parses single-quoted JSON using jsonrepair', () => {
    // jsonrepair handles trailing commas and other common issues
    const result = safeJsonParse('[1, 2, 3,]', null);
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns fallback for null/undefined input', () => {
    expect(safeJsonParse(undefined as unknown as string, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// isImageFile
// ---------------------------------------------------------------------------

describe('isImageFile', () => {
  it.each(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])('returns true for %s extension', (ext) => {
    expect(isImageFile(`/workspace/photo${ext}`)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isImageFile('/workspace/photo.PNG')).toBe(true);
    expect(isImageFile('/workspace/photo.JPG')).toBe(true);
  });

  it.each(['.ts', '.txt', '.json', '.mp4', ''])('returns false for %s extension', (ext) => {
    expect(isImageFile(`/workspace/file${ext}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHttpUrl
// ---------------------------------------------------------------------------

describe('isHttpUrl', () => {
  it('returns true for http:// URLs', () => {
    expect(isHttpUrl('http://example.com/img.png')).toBe(true);
  });

  it('returns true for https:// URLs', () => {
    expect(isHttpUrl('https://example.com/img.png')).toBe(true);
  });

  it('returns false for file paths', () => {
    expect(isHttpUrl('/abs/path/img.png')).toBe(false);
    expect(isHttpUrl('relative/img.png')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isHttpUrl('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFileExtensionFromDataUrl
// ---------------------------------------------------------------------------

describe('getFileExtensionFromDataUrl', () => {
  it('extracts .png from image/png data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/png;base64,abc')).toBe('.png');
  });

  it('extracts .jpg from image/jpeg data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/jpeg;base64,abc')).toBe('.jpg');
  });

  it('extracts .gif from image/gif data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/gif;base64,abc')).toBe('.gif');
  });

  it('extracts .webp from image/webp data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/webp;base64,abc')).toBe('.webp');
  });

  it('returns default extension for unknown mime type', () => {
    const result = getFileExtensionFromDataUrl('data:image/unknown-format;base64,abc');
    expect(result).toMatch(/^\./);
  });

  it('returns default extension for non-data-URL string', () => {
    const result = getFileExtensionFromDataUrl('https://example.com/img.png');
    expect(result).toMatch(/^\./);
  });
});

// ---------------------------------------------------------------------------
// processImageUri — HTTP URLs (no fs access required)
// ---------------------------------------------------------------------------

describe('processImageUri — HTTP URLs', () => {
  it('returns image_url object for http URL without touching fs', async () => {
    const result = await processImageUri('http://example.com/photo.png', '/workspace');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'http://example.com/photo.png', detail: 'auto' },
    });
  });

  it('returns image_url object for https URL', async () => {
    const result = await processImageUri('https://cdn.example.com/img.jpg', '/workspace');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/img.jpg', detail: 'auto' },
    });
  });
});

// ---------------------------------------------------------------------------
// processImageUri — local file paths (with fs mocking)
// ---------------------------------------------------------------------------

describe('processImageUri — local file paths', () => {
  beforeEach(() => {
    vi.spyOn(fsModule.promises, 'access').mockResolvedValue(undefined);
    vi.spyOn(fsModule.promises, 'readFile').mockResolvedValue(Buffer.from('fake-image-data'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves relative path against workspaceDir and returns base64 image_url', async () => {
    const result = await processImageUri('photo.png', '/workspace');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('image_url');
    expect(result?.image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(result?.image_url.detail).toBe('auto');
  });

  it('accepts absolute paths directly', async () => {
    const result = await processImageUri('/abs/path/photo.webp', '/workspace');
    expect(result).not.toBeNull();
    expect(result?.image_url.url).toMatch(/^data:image\/webp;base64,/);
  });

  it('strips leading @ from filename', async () => {
    const result = await processImageUri('@photo.png', '/workspace');
    expect(result).not.toBeNull();
    expect(result?.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('throws for unsupported file extension', async () => {
    await expect(processImageUri('document.txt', '/workspace')).rejects.toThrow('not a supported image type');
  });

  it('throws with searched paths when file not found', async () => {
    vi.spyOn(fsModule.promises, 'access').mockRejectedValue(new Error('ENOENT: no such file'));
    await expect(processImageUri('missing.png', '/workspace')).rejects.toThrow('Image file not found');
  });
});

// ---------------------------------------------------------------------------
// executeImageGeneration — signal pre-aborted
// ---------------------------------------------------------------------------

describe('executeImageGeneration — aborted signal', () => {
  it('returns cancelled result immediately when signal is pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await executeImageGeneration(
      { prompt: 'generate a cat' },
      { id: 'test', name: 'test', platform: 'openai', baseUrl: '', apiKey: 'k', useModel: 'model' },
      '/workspace',
      undefined,
      controller.signal
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('cancelled');
    expect(result.text).toContain('cancelled');
  });
});

describe('executeImageGeneration — OpenAI image endpoint', () => {
  beforeEach(() => {
    vi.spyOn(fsModule.promises, 'writeFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('uses images.generate for image models on openai-compatible providers', async () => {
    const createImage = vi.fn().mockResolvedValue({
      data: [{ b64_json: Buffer.from('fake-image').toString('base64'), revised_prompt: 'revised tiger prompt' }],
    });
    const createChatCompletion = vi.fn();
    const mockClient = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient & {
      createImage: typeof createImage;
      createChatCompletion: typeof createChatCompletion;
    };
    mockClient.createImage = createImage;
    mockClient.createChatCompletion = createChatCompletion;
    vi.mocked(ClientFactory.createRotatingClient).mockResolvedValue(mockClient as never);

    const result = await executeImageGeneration(
      { prompt: 'a tiger sitting in the clouds' },
      {
        id: 'test',
        name: 'test',
        platform: 'new-api',
        baseUrl: 'https://example.com/v1',
        apiKey: 'k',
        useModel: 'gemini-3.1-flash-image',
      },
      '/workspace'
    );

    expect(createImage).toHaveBeenCalled();
    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.text).toContain('revised tiger prompt');
  });

  it('uses Gemini native generateContent endpoint for LiteLLM Gemini image routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'gemini native image result' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from('gemini-native-image').toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeImageGeneration(
      { prompt: 'a cat sitting in the clouds' },
      {
        id: 'test',
        name: 'LiteLLM Gemini',
        platform: 'new-api',
        baseUrl: 'https://litellm-internal.123u.com/v1',
        apiKey: 'k',
        useModel: 'gemini-3.1-flash-image',
      },
      '/workspace'
    );

    expect(vi.mocked(ClientFactory.createRotatingClient)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://litellm-internal.123u.com/gemini/v1beta/models/gemini-3.1-flash-image:generateContent?key=k',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain('gemini native image result');
  });
});
