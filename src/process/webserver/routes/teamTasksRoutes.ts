/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '@process/services/database';

/** Matches adminRoutes team member roles (viewer/member/admin/owner). */
function teamMembershipRank(role: string): number {
  switch (role) {
    case 'viewer':
      return 1;
    case 'member':
      return 2;
    case 'admin':
      return 3;
    case 'owner':
      return 4;
    default:
      return 0;
  }
}

function minTeamRoleToRank(minRole: 'viewer' | 'member' | 'owner'): number {
  if (minRole === 'viewer') return 1;
  if (minRole === 'member') return 2;
  return 4;
}

function isPrivileged(role: string | undefined): boolean {
  return role === 'system_admin' || role === 'org_admin' || role === 'admin';
}

async function getTeamRole(req: Request, teamId: string): Promise<string | null> {
  const db = await getDatabase();
  const driver = db.getDriver();
  const tenantId = req.user?.tenant_id ?? 'default';
  const userId = req.user?.id ?? '';
  if (!userId) return null;

  const row = driver
    .prepare(
      `
      SELECT role
      FROM team_memberships
      WHERE tenant_id = ? AND team_id = ? AND user_id = ?
      LIMIT 1
    `
    )
    .get(tenantId, teamId, userId) as { role: string } | undefined;

  return row?.role ?? null;
}

function requireTeamAccess(minRole: 'viewer' | 'member' | 'owner') {
  const needed = minTeamRoleToRank(minRole);

  return async (req: Request, res: Response, next: NextFunction) => {
    const teamId = (req.query.teamId as string) || (req.body?.teamId as string) || (req.params.teamId as string);
    if (!teamId) {
      res.status(400).json({ success: false, error: 'Missing teamId' });
      return;
    }

    if (isPrivileged(req.user?.role)) {
      (req as any).__teamRole = 'owner';
      next();
      return;
    }

    const role = await getTeamRole(req, teamId);
    const rank = role ? teamMembershipRank(role) : 0;
    if (!role || rank < needed) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    (req as any).__teamRole = role;
    next();
  };
}

export function registerTeamTasksRoutes(app: Express, middlewares: { rateLimit: any; auth: any }): void {
  /**
   * List team tasks
   * GET /api/team-tasks?teamId=...
   */
  app.get('/api/team-tasks', middlewares.rateLimit, middlewares.auth, requireTeamAccess('viewer'), async (req, res) => {
    const teamId = String(req.query.teamId || '');
    const tenantId = req.user?.tenant_id ?? 'default';
    const db = await getDatabase();
    const driver = db.getDriver();

    const rows = driver
      .prepare(
        `
        SELECT *
        FROM team_tasks
        WHERE tenant_id = ? AND team_id = ?
        ORDER BY created_at ASC
      `
      )
      .all(tenantId, teamId);

    res.json({ success: true, data: rows });
  });

  /**
   * Create team task
   * POST /api/team-tasks
   */
  app.post('/api/team-tasks', middlewares.rateLimit, middlewares.auth, requireTeamAccess('member'), async (req, res) => {
    const tenantId = req.user?.tenant_id ?? 'default';
    const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description : null;
    const owner = typeof req.body?.owner === 'string' ? req.body.owner : null;

    if (!teamId || !subject) {
      res.status(400).json({ success: false, error: 'Missing teamId or subject' });
      return;
    }

    const now = Date.now();
    const id = `teamtask_${randomUUID()}`;
    const db = await getDatabase();
    const driver = db.getDriver();
    driver
      .prepare(
        `INSERT INTO team_tasks (id, tenant_id, team_id, subject, description, status, owner, blocked_by, blocks, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, '[]', '[]', '{}', ?, ?)`
      )
      .run(id, tenantId, teamId, subject, description, owner, now, now);

    const row = driver.prepare('SELECT * FROM team_tasks WHERE tenant_id = ? AND id = ?').get(tenantId, id);
    res.json({ success: true, data: row });
  });

  /**
   * Update team task
   * PATCH /api/team-tasks/:id
   */
  app.patch(
    '/api/team-tasks/:id',
    middlewares.rateLimit,
    middlewares.auth,
    async (req: Request, res: Response, next: NextFunction) => {
      // Resolve teamId for RBAC check from task id
      const tenantId = req.user?.tenant_id ?? 'default';
      const db = await getDatabase();
      const driver = db.getDriver();
      const taskId = req.params.id;
      const task = driver
        .prepare('SELECT team_id FROM team_tasks WHERE tenant_id = ? AND id = ?')
        .get(tenantId, taskId) as { team_id: string } | undefined;
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      (req as any).query = { ...(req as any).query, teamId: task.team_id };
      next();
    },
    requireTeamAccess('member'),
    async (req, res) => {
      const tenantId = req.user?.tenant_id ?? 'default';
      const id = req.params.id;
      const updates = req.body ?? {};

      const fields: Array<{ col: string; val: any }> = [];
      if (typeof updates.subject === 'string') fields.push({ col: 'subject', val: updates.subject.trim() });
      if (typeof updates.description === 'string' || updates.description === null)
        fields.push({ col: 'description', val: updates.description });
      if (typeof updates.status === 'string') fields.push({ col: 'status', val: updates.status });
      if (typeof updates.owner === 'string' || updates.owner === null) fields.push({ col: 'owner', val: updates.owner });
      if (typeof updates.metadata === 'object' && updates.metadata)
        fields.push({ col: 'metadata', val: JSON.stringify(updates.metadata) });

      if (fields.length === 0) {
        res.status(400).json({ success: false, error: 'No updatable fields' });
        return;
      }

      const now = Date.now();
      const setSql = fields.map((f) => `${f.col} = ?`).join(', ');
      const args = fields.map((f) => f.val);

      const db = await getDatabase();
      const driver = db.getDriver();
      driver.prepare(`UPDATE team_tasks SET ${setSql}, updated_at = ? WHERE tenant_id = ? AND id = ?`).run(...args, now, tenantId, id);
      const row = driver.prepare('SELECT * FROM team_tasks WHERE tenant_id = ? AND id = ?').get(tenantId, id);
      res.json({ success: true, data: row });
    }
  );

  /**
   * Delete team task
   * DELETE /api/team-tasks/:id
   */
  app.delete(
    '/api/team-tasks/:id',
    middlewares.rateLimit,
    middlewares.auth,
    async (req: Request, res: Response, next: NextFunction) => {
      const tenantId = req.user?.tenant_id ?? 'default';
      const db = await getDatabase();
      const driver = db.getDriver();
      const taskId = req.params.id;
      const task = driver
        .prepare('SELECT team_id FROM team_tasks WHERE tenant_id = ? AND id = ?')
        .get(tenantId, taskId) as { team_id: string } | undefined;
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      (req as any).query = { ...(req as any).query, teamId: task.team_id };
      next();
    },
    requireTeamAccess('member'),
    async (req, res) => {
      const tenantId = req.user?.tenant_id ?? 'default';
      const db = await getDatabase();
      const driver = db.getDriver();
      const id = req.params.id;
      driver.prepare('DELETE FROM team_tasks WHERE tenant_id = ? AND id = ?').run(tenantId, id);
      res.json({ success: true });
    }
  );
}

