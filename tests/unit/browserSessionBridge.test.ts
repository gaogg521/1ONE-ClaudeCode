/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLatestBrowserWebuiSession,
  registerBrowserWebuiSession,
  resetBrowserWebuiSessionsForTests,
} from '@/process/webserver/auth/browserSessionBridge';

describe('browserSessionBridge', () => {
  beforeEach(() => {
    resetBrowserWebuiSessionsForTests();
  });

  it('returns the most recently registered browser session', async () => {
    registerBrowserWebuiSession({
      userId: 'u1',
      username: 'alice',
      role: 'member',
      token: 'token-a',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    registerBrowserWebuiSession({
      userId: 'u2',
      username: 'bob',
      role: 'org_admin',
      token: 'token-b',
    });

    const latest = getLatestBrowserWebuiSession();
    expect(latest?.username).toBe('bob');
    expect(latest?.token).toBe('token-b');
  });
});
