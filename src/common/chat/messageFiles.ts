/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ONE_FILES_MARKER } from '@/common/config/constants';
import { extname, isPathInsideDir, joinPath, resolvePath } from '@/common/chat/pathUtils';

const ATTACHMENT_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.svg',
  '.avif',
  '.tif',
  '.tiff',
  '.ico',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.rtf',
]);

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

export function isImageFilePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath));
}

function hasKnownAttachmentExtension(filePath: string): boolean {
  return ATTACHMENT_EXTENSIONS.has(extname(filePath));
}

/** Strip trailing non-path garbage when PDF text was accidentally concatenated to a path line. */
function salvageAttachmentPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  for (const ext of ATTACHMENT_EXTENSIONS) {
    const bareExt = ext.slice(1);
    const index = trimmed.toLowerCase().indexOf(ext);
    if (index === -1) {
      continue;
    }
    const candidate = trimmed.slice(0, index + ext.length);
    if (candidate.length >= ext.length + 1) {
      return candidate;
    }
  }

  return null;
}

/** True when a marker line looks like a real attachment path (not extracted document text). */
export function isLikelyAttachmentPath(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^[-#*>]/.test(trimmed) || /^##\s/.test(trimmed)) {
    return false;
  }
  if (/^\*\*[^*]+\*\*/.test(trimmed)) {
    return false;
  }

  const salvaged = salvageAttachmentPath(trimmed);
  const candidate = salvaged ?? trimmed;
  if (!hasKnownAttachmentExtension(candidate)) {
    return false;
  }

  const looksLikePath =
    /^[A-Za-z]:[\\/]/.test(candidate) ||
    candidate.startsWith('/') ||
    candidate.includes('/') ||
    candidate.includes('\\');

  return looksLikePath || salvaged !== null;
}

/** Keep only plausible attachment paths from marker lines. */
export function filterValidAttachmentPaths(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!isLikelyAttachmentPath(trimmed)) {
      continue;
    }
    const salvaged = salvageAttachmentPath(trimmed);
    const normalized = salvaged ?? trimmed;
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

/** Parse attachment paths embedded after ONE_FILES_MARKER. */
export function parseDisplayMessageFiles(content: string): string[] {
  const markerIndex = content.indexOf(ONE_FILES_MARKER);
  if (markerIndex === -1) {
    return [];
  }
  const afterMarker = content.slice(markerIndex + ONE_FILES_MARKER.length).trim();
  if (!afterMarker) {
    return [];
  }
  return filterValidAttachmentPaths(
    afterMarker
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
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
  const validFiles = filterValidAttachmentPaths(files);
  if (!validFiles.length) {
    return input;
  }
  const displayPaths = validFiles.map((filePath) => {
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
