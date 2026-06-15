/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Reject model-hallucinated "paths" (e.g. Chinese sentence fragments ending in .json). */
export function isPlausibleReadFilePath(filePath: string): boolean {
  const trimmed = filePath.trim();
  if (!trimmed || trimmed.length > 512) {
    return false;
  }

  const looksLikeAbsolute = /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\\\');
  const hasPathSeparator = trimmed.includes('/') || trimmed.includes('\\');

  // Natural-language sentences are not filesystem paths.
  if (/[。！？；，、：""''（）【】《》]/.test(trimmed)) {
    return false;
  }
  if (/[\u4e00-\u9fff]/.test(trimmed) && !looksLikeAbsolute) {
    return false;
  }
  if (trimmed.includes('…') || (trimmed.includes('...') && !hasPathSeparator)) {
    return false;
  }
  if (!looksLikeAbsolute && !hasPathSeparator && trimmed.length > 120) {
    return false;
  }

  return true;
}
