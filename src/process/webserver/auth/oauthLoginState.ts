/**
 * OAuth CSRF state for browser login callbacks (Feishu / DingTalk / WeCom).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type OAuthLoginStateEntry = {
  expiresAt: number;
  redirectTarget: string;
};

export const OAUTH_LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_POST_LOGIN_TARGET = '/sessions';

const stores = new Map<string, Map<string, OAuthLoginStateEntry>>();

function getProviderStore(provider: string): Map<string, OAuthLoginStateEntry> {
  let store = stores.get(provider);
  if (!store) {
    store = new Map();
    stores.set(provider, store);
  }
  return store;
}

export function cleanupOAuthLoginState(provider: string): void {
  const store = getProviderStore(provider);
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

export function issueOAuthLoginState(provider: string, redirectTarget: string): string {
  cleanupOAuthLoginState(provider);
  const state = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  getProviderStore(provider).set(state, {
    expiresAt: Date.now() + OAUTH_LOGIN_STATE_TTL_MS,
    redirectTarget,
  });
  return state;
}

export function consumeOAuthLoginState(provider: string, state: string): OAuthLoginStateEntry | null {
  const store = getProviderStore(provider);
  const entry = store.get(state);
  store.delete(state);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    return null;
  }
  return entry;
}

export const OAUTH_STATE_INVALID_MESSAGE =
  'OAuth state expired or invalid. Please return to the app and start login again.';

/** @deprecated Tests only — production callbacks must reject invalid state. */
export function fallbackOAuthLoginStateEntry(
  redirectTarget = DEFAULT_POST_LOGIN_TARGET
): OAuthLoginStateEntry {
  return {
    expiresAt: Date.now() + OAUTH_LOGIN_STATE_TTL_MS,
    redirectTarget,
  };
}

export function resetOAuthLoginStateStoresForTests(): void {
  stores.clear();
}
