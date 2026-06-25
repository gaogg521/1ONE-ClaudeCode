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
  if (!origin) {
    return '';
  }
  // Security: never trust an arbitrary Host header for the OAuth redirect URI.
  // Only allow localhost/127.0.0.1 origins as an automatic fallback (dev mode).
  // Production deployments must configure an explicit redirectUri.
  if (!isLocalhostOrigin(origin)) {
    return '';
  }
  return `${origin}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}`;
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function readRequestOrigin(req: { protocol?: string; get?: (name: string) => string | undefined }): string {
  const host = req.get?.('host')?.trim();
  if (!host) {
    return '';
  }
  const protocol = req.protocol ?? 'http';
  return `${protocol}://${host}`;
}
