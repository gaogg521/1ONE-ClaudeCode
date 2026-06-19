/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildWebuiAdminLoginUrl,
  buildWebuiAdminLoginUrlOnDedicatedPort,
  buildWebuiMemberLoginUrl,
  nextWebuiMemberPortAfterConflict,
  resolveWebuiAdminPort,
} from '@/common/config/webuiLoginAccess';

describe('webuiLoginAccess', () => {
  it('builds member and admin login URLs on the same origin', () => {
    const origin = 'http://172.29.128.120:25809';
    expect(buildWebuiMemberLoginUrl(origin)).toBe(
      'http://172.29.128.120:25809/#/login?redirect=%2Fguid&mode=enterprise'
    );
    expect(buildWebuiAdminLoginUrl(origin)).toBe(
      'http://172.29.128.120:25809/#/login?redirect=%2Fenterprise&mode=admin'
    );
  });

  it('builds admin URL on dedicated port offset', () => {
    expect(resolveWebuiAdminPort(25809)).toBe(25810);
    expect(buildWebuiAdminLoginUrlOnDedicatedPort('http://localhost:25809')).toBe(
      'http://localhost:25810/#/login?redirect=%2Fenterprise&mode=admin'
    );
  });

  it('skips the paired admin port when choosing the next member port', () => {
    expect(nextWebuiMemberPortAfterConflict(25809, 25809)).toBe(25811);
    expect(nextWebuiMemberPortAfterConflict(25808, 25808)).toBe(25810);
  });
});
