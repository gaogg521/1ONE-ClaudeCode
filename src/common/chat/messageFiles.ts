/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ONE_FILES_MARKER } from '@/common/config/constants';
import { extname, isPathInsideDir, joinPath, resolvePath } from '@/common/chat/pathUtils';

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp',
  '.svg',
  '.avif',
  '.tif',
  '.tiff',
  '.ico',
]);

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.wma',
  '.opus',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.flv',
  '.wmv',
  '.m4v',
]);

export function isImageFilePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath));
}

export function isAudioFilePath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(extname(filePath));
}

export function isVideoFilePath(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(filePath));
}

export function isMediaFilePath(filePath: string): boolean {
  return isImageFilePath(filePath) || isAudioFilePath(filePath) || isVideoFilePath(filePath);
}

export function isCacheTempFilePath(filePath: string, cacheDir: string): boolean {
  const tempDir = resolvePath(cacheDir, 'temp');
  return isPathInsideDir(filePath, tempDir);
}

/** Strip the embedded file list marker from a message body. */
export function stripFilesMarker(content: string): string {
  const markerIndex = content.indexOf(ONE_FILES_MARKER);
  if (markerIndex === -1) {
    return content;
  }
  return content.slice(0, markerIndex).trimEnd();
}

/**
 * Build the persisted/display message body with an embedded file path list.
 * Paths must remain loadable by FilePreview — do not rewrite or strip timestamps.
 */
export function buildDisplayMessage(input: string, files: string[], workspacePath: string): string {
  if (!files.length) {
    return input;
  }
  const displayPaths = files.map((filePath) => {
    if (!workspacePath) {
      return filePath;
    }
    const isAbsolute = filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath);
    if (isAbsolute) {
      return filePath;
    }
    return joinPath(workspacePath, filePath);
  });
  return `${input}\n\n${ONE_FILES_MARKER}\n${displayPaths.join('\n')}`;
}
