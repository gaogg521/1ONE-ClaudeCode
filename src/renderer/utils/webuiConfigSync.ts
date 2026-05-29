/**
 * Cross-surface refresh for WebUI-backed config (auth providers, enterprise context).
 * Desktop and browser renderer share the same WebUI SQLite when pointed at one instance.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const ONE_WEBUI_CONFIG_REFRESH = 'one-webui-config-refresh';

/** Notify listeners to reload admin/auth config from the WebUI API. */
export function dispatchWebuiConfigRefresh(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(ONE_WEBUI_CONFIG_REFRESH));
  window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
}
