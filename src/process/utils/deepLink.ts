/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';

export const PROTOCOL_SCHEME = '1one';
const SUPPORTED_PROTOCOL_SCHEMES = ['1one', '1one-claudecode'];

/**
 * Parse an 1ONE ClaudeCode:// URL into action and params.
 * Supports two formats:
 *   1. 1ONE ClaudeCode://add-provider?baseUrl=xxx&apiKey=xxx
 *   2. 1ONE ClaudeCode://provider/add?v=1&data=<base64 JSON>  (one-api / new-api style)
 */
export const parseDeepLinkUrl = (url: string): { action: string; params: Record<string, string> } | null => {
  // Note: `new URL()` rejects schemes starting with digits (e.g. `1one-claudecode://`).
  // Parse manually to keep compatibility.
  const match = url.match(
    /^([0-9a-zA-Z+.-]+):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/
  );
  if (!match) return null;

  const protocol = match[1];
  if (!SUPPORTED_PROTOCOL_SCHEMES.includes(protocol)) return null;

  const hostname = match[2] ?? '';
  const rawPath = match[3] ?? '';
  const pathname = rawPath.replace(/^\/+/, '');
  const action = pathname ? `${hostname}/${pathname}` : hostname;

  const queryString = match[4] ?? '';
  const params: Record<string, string> = {};
  if (queryString) {
    for (const part of queryString.split('&')) {
      if (!part) continue;
      const eqIndex = part.indexOf('=');
      const key = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
      const value = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
      if (!key) continue;
      try {
        params[key] = decodeURIComponent(value);
      } catch {
        // If decodeURIComponent fails (malformed escape), keep the raw value.
        params[key] = value;
      }
    }
  }

  // If data param exists, decode base64 JSON and merge into params
  if (params.data !== undefined) {
    try {
      const json = JSON.parse(Buffer.from(params.data, 'base64').toString('utf-8'));
      if (json && typeof json === 'object') Object.assign(params, json);
    } catch {
      // Ignore decode errors
    } finally {
      // Always remove raw data param after attempting decode
      delete params.data;
    }
  }

  return { action, params };
};

let mainWindowRef: BrowserWindow | null = null;
let pendingDeepLinkUrl: string | null =
  process.argv.find((arg) => SUPPORTED_PROTOCOL_SCHEMES.some((scheme) => arg.startsWith(`${scheme}://`))) || null;

export const setDeepLinkMainWindow = (win: BrowserWindow): void => {
  mainWindowRef = win;
};

export const getPendingDeepLinkUrl = (): string | null => pendingDeepLinkUrl;

export const clearPendingDeepLinkUrl = (): void => {
  pendingDeepLinkUrl = null;
};

/**
 * Send the deep-link payload to the renderer via IPC bridge.
 * If the window isn't ready yet, queue it.
 */
export const handleDeepLinkUrl = (url: string): void => {
  const parsed = parseDeepLinkUrl(url);
  if (!parsed) return;

  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    pendingDeepLinkUrl = url;
    return;
  }

  ipcBridge.deepLink.received.emit(parsed);
};
