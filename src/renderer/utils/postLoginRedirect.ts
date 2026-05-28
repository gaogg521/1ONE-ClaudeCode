/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

const POST_LOGIN_REDIRECT_KEY = 'one-post-login-redirect';

const DEFAULT_POST_LOGIN_PATH = '/guid';

/** Allowed internal hash-router paths after login (must start with `/`, no protocol). */
function normalizeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//') || trimmed.includes('://')) return null;
  return trimmed;
}

export function setPostLoginRedirect(path: string): void {
  const normalized = normalizeRedirectPath(path);
  if (!normalized || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, normalized);
}

export function peekPostLoginRedirect(): string {
  if (typeof sessionStorage === 'undefined') return DEFAULT_POST_LOGIN_PATH;
  return normalizeRedirectPath(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)) ?? DEFAULT_POST_LOGIN_PATH;
}

export function consumePostLoginRedirect(): string {
  const path = peekPostLoginRedirect();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  }
  return path;
}

export function readRedirectFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return normalizeRedirectPath(params.get('redirect'));
  } catch {
    return null;
  }
}
