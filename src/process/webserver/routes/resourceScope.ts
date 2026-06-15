/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import { isEnterpriseAdminRole } from '../auth/enterpriseRoles';

export type ResourceScope = 'personal' | 'team' | 'organization';

export type ResolvedResourceScope = {
  scope: ResourceScope;
  teamId: string | null;
};

export type ResourceScopeError = {
  error: string;
  status: number;
};

type ScopeDriver = {
  prepare: (sql: string) => {
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => unknown[];
  };
};

export type ScopedResourceRow = {
  scope: string;
  team_id: string | null;
  created_by: string;
};

const ORGANIZATION_SCOPE_SQL = `scope IN ('organization', 'tenant', 'org')`;

/** Normalize legacy organization scope names left by older resource loaders. */
export function normalizeResourceScope(scope: unknown): ResourceScope {
  const value = String(scope ?? 'personal').trim();
  if (value === 'organization' || value === 'tenant' || value === 'org') {
    return 'organization';
  }
  if (value === 'team') {
    return 'team';
  }
  return 'personal';
}

/** Non-admin visibility filter: organization + own personal + team resources where user is a member. */
export const VISIBLE_RESOURCE_WHERE = `(${ORGANIZATION_SCOPE_SQL} OR created_by = ? OR (scope = 'team' AND team_id IN (
  SELECT team_id FROM team_memberships WHERE tenant_id = ? AND user_id = ?
)))`;

/** Same as VISIBLE_RESOURCE_WHERE but with a table alias prefix (e.g. `d`). */
export const VISIBLE_RESOURCE_WHERE_ALIAS = (alias: string): string =>
  `(${alias}.scope IN ('organization', 'tenant', 'org') OR ${alias}.created_by = ? OR (${alias}.scope = 'team' AND ${alias}.team_id IN (
  SELECT team_id FROM team_memberships WHERE tenant_id = ? AND user_id = ?
)))`;

export function resolveResourceScope(
  req: Request,
  driver: ScopeDriver,
  tenantId: string,
  input: { scope?: unknown; team_id?: unknown }
): ResolvedResourceScope | ResourceScopeError {
  const isAdmin = isEnterpriseAdminRole(req.user?.role);
  const requestedScope = normalizeResourceScope(input.scope);
  const teamId = input.team_id != null ? String(input.team_id).trim() : '';

  if (requestedScope === 'organization') {
    if (!isAdmin) {
      return { scope: 'personal', teamId: null };
    }
    return { scope: 'organization', teamId: null };
  }

  if (requestedScope === 'team') {
    if (!teamId) {
      return { error: 'team_id is required for team scope', status: 400 };
    }
    const membership = driver
      .prepare(`SELECT 1 FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`)
      .get(tenantId, teamId, req.user!.id);
    if (!membership && !isAdmin) {
      return { error: 'Not a member of this team', status: 403 };
    }
    return { scope: 'team', teamId };
  }

  return { scope: 'personal', teamId: null };
}

export function canManageScopedResource(
  req: Request,
  driver: ScopeDriver,
  tenantId: string,
  resource: ScopedResourceRow
): boolean {
  const userId = req.user!.id;
  if (isEnterpriseAdminRole(req.user?.role)) {
    return true;
  }
  if (resource.created_by === userId) {
    return true;
  }
  if (resource.scope === 'team' && resource.team_id) {
    const row = driver
      .prepare(`SELECT role FROM team_memberships WHERE tenant_id = ? AND team_id = ? AND user_id = ?`)
      .get(tenantId, resource.team_id, userId) as { role: string } | undefined;
    return row?.role === 'owner' || row?.role === 'admin';
  }
  return false;
}

export function getTeamPeerUserIds(driver: ScopeDriver, tenantId: string, userId: string): string[] {
  const rows = driver
    .prepare(
      `SELECT DISTINCT m2.user_id AS user_id
       FROM team_memberships m1
       JOIN team_memberships m2 ON m1.tenant_id = m2.tenant_id AND m1.team_id = m2.team_id
       WHERE m1.tenant_id = ? AND m1.user_id = ?`
    )
    .all(tenantId, userId) as Array<{ user_id: string }>;
  const peerIds = rows.map((row) => row.user_id);
  if (!peerIds.includes(userId)) {
    peerIds.push(userId);
  }
  return peerIds;
}

export function getScopedResourceOrNull(
  driver: ScopeDriver,
  tenantId: string,
  table: 'rag_documents' | 'skills_registry' | 'mcp_registry',
  id: string
): ScopedResourceRow | null {
  const row = driver
    .prepare(`SELECT scope, team_id, created_by FROM ${table} WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as ScopedResourceRow | undefined;
  return row ?? null;
}
