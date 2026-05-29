/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveOAuthCallbackUri } from '@/common/auth/oauthCallbackUri';
import {
  consumeOAuthLoginState,
  issueOAuthLoginState,
  resetOAuthLoginStateStoresForTests,
} from '@/process/webserver/auth/oauthLoginState';

describe('oauthCallbackUri', () => {
  it('uses configured redirect when present', () => {
    expect(
      resolveOAuthCallbackUri('https://custom.example/callback', '/api/auth/dingtalk/callback', 'https://host')
    ).toBe('https://custom.example/callback');
  });

  it('falls back to request origin plus callback path', () => {
    expect(resolveOAuthCallbackUri('', '/api/auth/wecom/callback', 'https://host/')).toBe(
      'https://host/api/auth/wecom/callback'
    );
  });
});

describe('oauthLoginState', () => {
  it('issues and consumes state once', () => {
    resetOAuthLoginStateStoresForTests();
    const state = issueOAuthLoginState('dingtalk', '/sessions');
    const entry = consumeOAuthLoginState('dingtalk', state);
    expect(entry?.redirectTarget).toBe('/sessions');
    expect(consumeOAuthLoginState('dingtalk', state)).toBeNull();
  });
});
