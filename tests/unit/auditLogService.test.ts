/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

const runMock = vi.fn();

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    getDriver: () => ({
      prepare: () => ({ run: runMock }),
    }),
  })),
}));

import { GOVERNANCE_AUDIT_ACTIONS, recordGovernanceAudit } from '@process/webserver/auth/auditLogService';

describe('auditLogService', () => {
  it('records governance audit rows', async () => {
    runMock.mockClear();
    const req = {
      user: { id: 'actor-1', username: 'alice', role: 'system_admin', tenant_id: 'default' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    } as unknown as Request;

    await recordGovernanceAudit(req, GOVERNANCE_AUDIT_ACTIONS.claimSystemAdmin, 'actor-1', 'alice');

    expect(runMock).toHaveBeenCalledTimes(1);
    const args = runMock.mock.calls[0] as unknown[];
    expect(args[4]).toBe(GOVERNANCE_AUDIT_ACTIONS.claimSystemAdmin);
    expect(String(args[5])).toContain('user:actor-1:alice');
  });
});
