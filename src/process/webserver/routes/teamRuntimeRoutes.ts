/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response, NextFunction } from 'express';
import {
  listTeamRuntimeNodesForApi,
  upsertTeamRuntimeNodeForApi,
} from '@process/bridge/teamRuntimeBridge';
import type { UpsertTeamRuntimeNodeInput } from '@/common/types/teamRuntimeTypes';
import { ADMIN_TEAM_RUNTIME_NODES_PATH } from '@/common/teamRuntime/syncChannels';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import { AuthService } from '../auth/service/AuthService';
import { TokenMiddleware } from '../auth/middleware/TokenMiddleware';

function parseTeamIds(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function requireEnterpriseAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isEnterpriseAdminRole(req.user?.role)) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  next();
}

/**
 * Optional auth: resolves the signed-in user (if any) for the heartbeat endpoint.
 * Pending devices (no token) still report as 'pending' so admins can see them.
 * We don't mutate req.user — Express's type requires `username` which the JWT
 * payload may lack; instead we read the decoded payload inline.
 */
async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = TokenMiddleware.extractToken(req);
  if (!token) {
    next();
    return;
  }
  const decoded = await AuthService.verifyToken(token);
  if (decoded) {
    (req as Request & { resolvedUser?: { id: string; tenant_id?: string; role?: string } }).resolvedUser = {
      id: decoded.userId,
      tenant_id: (decoded as { tenant_id?: string }).tenant_id,
      role: decoded.role,
    };
  }
  next();
}

export function registerTeamRuntimeRoutes(
  app: Express,
  authenticate: (req: Request, res: Response, next: NextFunction) => void
): void {
  // Heartbeat accepts both signed-in and pending devices. A device that has only
  // configured the server address (deploymentRole=client + serverUrl) but not yet
  // completed SSO still reports here with tenantId/userId='pending' so the admin
  // fleet view can show it.
  app.post('/api/team-runtime/heartbeat', optionalAuth, async (req: Request, res: Response) => {
    const resolved = (req as Request & { resolvedUser?: { id: string; tenant_id?: string } }).resolvedUser;
    const signedTenantId = resolved?.tenant_id;
    const signedUserId = resolved?.id;
    const authenticated = !!signedUserId;
    const tenantId = authenticated && signedTenantId ? signedTenantId : 'pending';
    const userId = authenticated && signedUserId ? signedUserId : 'pending';
    const body = req.body as Partial<UpsertTeamRuntimeNodeInput>;
    if (!body.machineId || !body.displayName) {
      res.status(400).json({ success: false, error: 'machineId and displayName are required' });
      return;
    }
    const node = await upsertTeamRuntimeNodeForApi({
      tenantId,
      userId,
      machineId: String(body.machineId),
      displayName: String(body.displayName),
      hostnames: Array.isArray(body.hostnames) ? body.hostnames.map(String) : [String(body.displayName)],
      ipAddresses: Array.isArray(body.ipAddresses) ? body.ipAddresses.map(String) : [],
      installedAgents: Array.isArray(body.installedAgents) ? body.installedAgents : [],
      authenticated,
    });
    res.json({ success: true, data: node });
  });

  app.get('/api/team-runtime/nodes', authenticate, async (req: Request, res: Response) => {
    const tenantId = req.user?.tenant_id ?? 'default';
    const teamIds = parseTeamIds(req.query.teamIds);
    const includeOffline = req.query.includeOffline === '1' || req.query.includeOffline === 'true';
    const nodes = await listTeamRuntimeNodesForApi({ tenantId, teamIds, includeOffline });
    res.json({ success: true, data: nodes });
  });

  /** 超级管理员后台：查看本租户全部成员机器（C/S + B/S 上报）+ 未认证设备 */
  app.get(ADMIN_TEAM_RUNTIME_NODES_PATH, authenticate, requireEnterpriseAdmin, async (req: Request, res: Response) => {
    const tenantId = req.user?.tenant_id ?? 'default';
    if (!isEnterpriseTenantId(tenantId)) {
      res.json({ success: true, data: [] });
      return;
    }
    const teamIds = parseTeamIds(req.query.teamIds);
    const includeOffline = req.query.includeOffline === '1' || req.query.includeOffline === 'true';
    const nodes = await listTeamRuntimeNodesForApi({
      tenantId,
      teamIds,
      includeOffline,
      includePending: true,
    });
    res.json({ success: true, data: nodes });
  });
}
