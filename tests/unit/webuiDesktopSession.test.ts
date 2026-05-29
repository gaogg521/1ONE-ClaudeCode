/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.stubGlobal('window', {
  sessionStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  },
});

import {
  getDesktopAdminBearerToken,
  getWebuiDesktopSession,
  setWebuiDesktopSession,
} from '@/renderer/utils/webuiDesktopSession';

describe('webuiDesktopSession', () => {
  beforeEach(() => {
    storage.clear();
    setWebuiDesktopSession(null);
  });

  it('returns admin bearer only for enterprise admin roles', () => {
    setWebuiDesktopSession({
      userId: 'user-1',
      username: 'alice',
      role: 'system_admin',
      token: 'jwt-test',
    });
    expect(getDesktopAdminBearerToken()).toBe('jwt-test');

    setWebuiDesktopSession({
      userId: 'user-2',
      username: 'bob',
      role: 'member',
      token: 'jwt-member',
    });
    expect(getDesktopAdminBearerToken()).toBeNull();
    expect(getWebuiDesktopSession()?.token).toBe('jwt-member');
  });
});
