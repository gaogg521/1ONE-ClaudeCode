/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_UNAVAILABLE_MARKERS = [
  'Database is corrupted',
  'cannot be recovered',
  'Failed to load auth provider',
  'Failed to list auth providers',
  'Failed to save auth provider',
] as const;

/**
 * Detect SQLite init / repository failures caused by a broken or locked local database.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const msg = current instanceof Error ? current.message : String(current);
    if (DB_UNAVAILABLE_MARKERS.some((marker) => msg.includes(marker))) {
      return true;
    }
    current = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined;
  }
  return false;
}

export const DB_UNAVAILABLE_RESPONSE = {
  success: false as const,
  code: 'db_unavailable' as const,
  message:
    'Local database is unavailable. Close other 1ONE instances, restart the app, or delete the corrupted database file and try again.',
};
