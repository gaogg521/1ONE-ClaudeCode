/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildWebuiApiBaseCandidates } from '@/common/config/webuiApiBaseCandidates';

describe('buildWebuiApiBaseCandidates', () => {
  it('prefers loopback origins before LAN URL', () => {
    const candidates = buildWebuiApiBaseCandidates({
      port: 25809,
      localUrl: 'http://localhost:25809',
      networkUrl: 'http://172.29.128.120:25809',
      lanIP: '172.29.128.120',
    });

    expect(candidates[0]).toBe('http://localhost:25809');
    expect(candidates).toContain('http://127.0.0.1:25809');
    expect(candidates.at(-1)).toBe('http://172.29.128.120:25809');
  });
});
