/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export function resolveOAuthCallbackUri(configuredRedirectUri: string, callbackPath: string, requestOrigin: string): string {
  const configured = configuredRedirectUri.trim();
  if (configured) {
    return configured;
  }
  const origin = requestOrigin.trim().replace(/\/+$/, '');
  return origin ? `${origin}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}` : '';
}

export function readRequestOrigin(req: { protocol?: string; get?: (name: string) => string | undefined }): string {
  const host = req.get?.('host')?.trim();
  if (!host) {
    return '';
  }
  const protocol = req.protocol ?? 'http';
  return `${protocol}://${host}`;
}
