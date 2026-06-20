/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import sharp from 'sharp';
import { isImageFilePath } from '@/common/chat/messageFiles';
import { getFileExtension } from '@/renderer/services/FileService';

/**
 * Max edge length for images sent to agents. High-res photos (4K+) encode to
 * 500K+ token base64 blobs that overflow 115K context windows. 1568px matches
 * the common vision-model recommendation and keeps most images under 5K tokens.
 */
const MAX_IMAGE_EDGE = 1568;
const JPEG_QUALITY = 80;

/**
 * Compress images in-place so they fit within agent context windows.
 * Non-image files are passed through unchanged.
 *
 * Why: ACP (Claude CLI) and Gemini receive image paths and inline the binary
 * as base64. A 4000x3000 PNG becomes ~700K tokens, instantly overflowing the
 * model's context. Downsampling to ≤1568px edge + JPEG q80 keeps the same
 * visual content at ~5-10K tokens.
 */
export async function compressImagesInPlace(filePaths: string[]): Promise<string[]> {
  const result: string[] = [];
  for (const filePath of filePaths) {
    if (!isImageFilePath(filePath)) {
      result.push(filePath);
      continue;
    }
    try {
      await compressSingleImage(filePath);
      result.push(filePath);
    } catch (error) {
      // Compression failed (corrupt image, unsupported format, sharp error).
      // Keep the original path — the agent may still handle it, or fail with
      // a clearer error than silently dropping the attachment.
      console.warn(`[imageCompress] Failed to compress ${filePath}:`, error);
      result.push(filePath);
    }
  }
  return result;
}

async function compressSingleImage(filePath: string): Promise<void> {
  const ext = getFileExtension(filePath).toLowerCase();
  // Sharp output format: convert everything to JPEG for token efficiency,
  // except PNGs with potential transparency — keep as PNG but re-compress.
  const usePng = ext === '.png';

  const pipeline = sharp(filePath, { failOn: 'none' })
    .rotate() // honor EXIF orientation
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (usePng) {
    await pipeline.png({ quality: JPEG_QUALITY, compressionLevel: 9, palette: true }).toFile(filePath + '.tmp');
  } else {
    await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(filePath + '.tmp');
  }

  // Atomic replace so a crash mid-compress never leaves a half-written file
  const fs = await import('fs/promises');
  await fs.rename(filePath + '.tmp', filePath);
}
