/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Browser-safe path helpers (no node:path — safe for renderer bundles). */

export function extname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot).toLowerCase();
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function joinPath(base: string, segment: string): string {
  const trimmedBase = base.replace(/[\\/]+$/, '');
  const trimmedSegment = segment.replace(/^[\\/]+/, '');
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return `${trimmedBase}${separator}${trimmedSegment}`;
}

export function resolvePath(base: string, ...segments: string[]): string {
  const parts = [normalizePath(base), ...segments.map((segment) => normalizePath(segment))].filter(Boolean);
  const isWindows = parts.some((part) => /^[A-Za-z]:/.test(part));
  const separator = isWindows ? '\\' : '/';
  const joined = parts.join('/').replace(/\/+/g, '/');
  if (isWindows) {
    return joined.replace(/\//g, '\\');
  }
  return joined;
}

export function isPathInsideDir(filePath: string, dirPath: string): boolean {
  try {
    const resolvedFile = resolvePath(filePath);
    const resolvedDir = resolvePath(dirPath);
    const separator = resolvedDir.includes('\\') ? '\\' : '/';
    const dirWithSep = resolvedDir.endsWith(separator) ? resolvedDir : `${resolvedDir}${separator}`;
    return resolvedFile === resolvedDir || resolvedFile.startsWith(dirWithSep);
  } catch {
    return false;
  }
}
