/**
 * Client identification for WebUI HTTP requests.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const ONE_WEBUI_CLIENT_HEADER = 'x-one-client';

export const ONE_WEBUI_CLIENT_DESKTOP = 'electron-desktop';

export function isElectronDesktopWebuiRequest(headers: Record<string, unknown> | undefined): boolean {
  if (!headers) {
    return false;
  }
  const raw = headers[ONE_WEBUI_CLIENT_HEADER] ?? headers[ONE_WEBUI_CLIENT_HEADER.toLowerCase()];
  return typeof raw === 'string' && raw.toLowerCase() === ONE_WEBUI_CLIENT_DESKTOP;
}
