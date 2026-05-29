/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const PROVIDER_HTTP_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PROVIDER_HTTP_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
