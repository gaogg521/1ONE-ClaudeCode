/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { captureCsrfTokenFromResponse } from '@process/webserver/middleware/csrfClient';
import { webui } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';

/**
 * Base URL for WebUI HTTP APIs.
 * - Browser WebUI: current origin
 * - Electron desktop: local WebUI server when running
 */
export async function getWebuiApiBaseUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (!isElectronDesktop()) {
    return window.location.origin;
  }

  try {
    let status: { running?: boolean; port?: number } | null = null;
    if (window.electronAPI?.webuiGetStatus) {
      const result = await window.electronAPI.webuiGetStatus();
      if (result?.success && result.data) {
        status = result.data;
      }
    } else {
      const result = await webui.getStatus.invoke();
      if (result.success && result.data) {
        status = result.data;
      }
    }
    if (status?.running && status.port) {
      return `http://127.0.0.1:${status.port}`;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchWebuiApi(path: string, init?: RequestInit): Promise<Response> {
  const base = await getWebuiApiBaseUrl();
  if (!base) {
    throw new Error('WEBUI_NOT_RUNNING');
  }
  const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  const response = await fetch(url, { ...init, credentials: 'include' });
  captureCsrfTokenFromResponse(response);
  return response;
}
