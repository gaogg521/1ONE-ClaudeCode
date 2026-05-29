/**
 * Instance / governance audit log writer.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { DEFAULT_TENANT_ID } from '@/common/config/webuiEnterpriseConfig';
import { getDatabase } from '@process/services/database';

export const GOVERNANCE_AUDIT_ACTIONS = {
  claimSystemAdmin: 'governance.claim_system_admin',
  grantSystemAdmin: 'governance.grant_system_admin',
  revokeSystemAdmin: 'governance.revoke_system_admin',
} as const;

export type GovernanceAuditAction = (typeof GOVERNANCE_AUDIT_ACTIONS)[keyof typeof GOVERNANCE_AUDIT_ACTIONS];

function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? '';
  }
  return req.ip ?? '';
}

function formatUserResource(userId: string, username?: string): string {
  return username ? `user:${userId}:${username}` : `user:${userId}`;
}

/**
 * Persist one audit row. Failures are logged and do not block the caller.
 */
export async function recordGovernanceAudit(
  req: Request,
  action: GovernanceAuditAction,
  targetUserId: string,
  targetUsername?: string
): Promise<void> {
  try {
    const db = await getDatabase();
    const driver = db.getDriver();
    const tenantId = (req.user?.tenant_id ?? DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
    const now = Date.now();
    driver
      .prepare(
        `INSERT INTO audit_logs (id, tenant_id, user_id, username, action, resource, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        tenantId,
        req.user?.id ?? null,
        req.user?.username ?? null,
        action,
        formatUserResource(targetUserId, targetUsername),
        resolveClientIp(req),
        String(req.headers['user-agent'] ?? ''),
        now
      );
  } catch (error) {
    console.warn('[AuditLog] recordGovernanceAudit failed:', error);
  }
}
