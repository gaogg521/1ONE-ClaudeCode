/**
 * Clear stale WebUI service worker caches after renderer rebuilds.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

const LEGACY_SW_CACHE_PREFIX = '1one-claudecode-webui-';
const CACHE_BUST_PARAM = '__one_cache_bust';

export async function clearWebuiServiceWorkerCaches(options?: { all?: boolean }): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return;
  }
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => options?.all === true || key.startsWith(LEGACY_SW_CACHE_PREFIX))
        .map((key) => caches.delete(key))
    );
  } catch (error) {
    console.warn('[WebUI] Failed to clear service worker caches:', error);
  }
}

export function buildCacheBustedWebuiUrl(currentHref: string, now = Date.now()): string {
  try {
    const url = new URL(currentHref);
    url.searchParams.set(CACHE_BUST_PARAM, String(now));
    return url.toString();
  } catch {
    return currentHref;
  }
}

export async function clearElectronRendererHttpCache(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return;
  }
  try {
    await ipcBridge.application.clearRendererHttpCache.invoke();
  } catch (error) {
    console.warn('[WebUI] Failed to clear Electron HTTP cache:', error);
  }
}

export async function resetWebuiClientCaches(): Promise<void> {
  await clearWebuiServiceWorkerCaches({ all: true });
  await clearElectronRendererHttpCache();
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      console.warn('[WebUI] Failed to unregister service worker:', error);
    }
  }
}
