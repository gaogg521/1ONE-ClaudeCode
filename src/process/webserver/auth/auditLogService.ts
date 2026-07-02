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
import { logRouteWarn } from '../webuiLog';

export const GOVERNANCE_AUDIT_ACTIONS = {
  claimSystemAdmin: 'governance.claim_system_admin',
  grantSystemAdmin: 'governance.grant_system_admin',
  revokeSystemAdmin: 'governance.revoke_system_admin',
} as const;

export type GovernanceAuditAction = (typeof GOVERNANCE_AUDIT_ACTIONS)[keyof typeof GOVERNANCE_AUDIT_ACTIONS];

// DevOps 资源审计动作（覆盖敏感写操作：删除/创建/状态变更）。
export const DEVOPS_AUDIT_ACTIONS = {
  requirementCreate: 'devops.requirement.create',
  requirementUpdate: 'devops.requirement.update',
  requirementDelete: 'devops.requirement.delete',
  pipelineCreate: 'devops.pipeline.create',
  pipelineUpdate: 'devops.pipeline.update',
  pipelineRun: 'devops.pipeline.run',
  mcpCreate: 'devops.mcp.create',
  mcpUpdate: 'devops.mcp.update',
  mcpDelete: 'devops.mcp.delete',
  mcpToggle: 'devops.mcp.toggle',
  ragDocumentDelete: 'devops.rag.document_delete',
  codeRepoCreate: 'devops.ccode.create',
  codeRepoDelete: 'devops.ccode.delete',
  artifactRepoCreate: 'devops.cpack.repo_create',
  artifactRepoDelete: 'devops.cpack.repo_delete',
  milestoneCreate: 'devops.milestone.create',
  testCaseUpdate: 'devops.ctest.update',
  valueStreamCreate: 'devops.cflow.create',
} as const;

export type DevopsAuditAction = (typeof DEVOPS_AUDIT_ACTIONS)[keyof typeof DEVOPS_AUDIT_ACTIONS];

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
    logRouteWarn('[AuditLog] recordGovernanceAudit failed', error);
  }
}

/**
 * Record a DevOps resource audit entry. `resource` is a free-form label
 * (e.g. "requirement:<id>", "mcp:<id>:<name>"). Failures are non-blocking.
 */
export async function recordDevopsAudit(req: Request, action: DevopsAuditAction, resource: string): Promise<void> {
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
        resource,
        resolveClientIp(req),
        String(req.headers['user-agent'] ?? ''),
        now
      );
  } catch (error) {
    // Fire-and-forget from every requirement/mcp/rag write route (`void recordDevopsAudit(...)`),
    // including Issue creation. console.* here is the "第 7 轮漏网" class of bug — never revert.
    logRouteWarn('[AuditLog] recordDevopsAudit failed', error);
  }
}
