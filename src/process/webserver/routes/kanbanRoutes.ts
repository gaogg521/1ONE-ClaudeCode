/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '@process/services/database/export';
import { TokenMiddleware } from '../auth/middleware/TokenMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';

const DESKTOP_USER_ID = 'system_default_user';

export function registerKanbanRoutes(app: Express): void {
  const auth = TokenMiddleware.validateToken({ responseType: 'json' });

  // GET /api/kanban/tasks — admin 看全部，user 只看自己的
  app.get('/api/kanban/tasks', apiRateLimiter, auth, async (req: Request, res: Response) => {
    try {
      const db = await getDatabase();
      const { id: userId, role } = req.user!;
      const result = role === 'admin' ? db.listPersonalTasks() : db.listPersonalTasks(userId);
      res.json({ success: true, data: result.data ?? [] });
    } catch (err) {
      console.error('[KanbanRoute] list error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/kanban/tasks
  app.post('/api/kanban/tasks', apiRateLimiter, auth, async (req: Request, res: Response) => {
    try {
      const db = await getDatabase();
      const { id: userId } = req.user!;
      const { subject, status, active_form, session_name, assigned_to } = req.body;
      if (!subject?.trim()) {
        res.status(400).json({ success: false, message: '任务名称不能为空' });
        return;
      }
      const now = Date.now();
      const task = {
        id: randomUUID(),
        user_id: userId,
        subject: subject.trim(),
        status: status ?? 'pending',
        active_form: active_form || null,
        session_name: session_name || null,
        assigned_to: assigned_to || null,
        created_at: now,
        updated_at: now,
      };
      const result = db.createPersonalTask(task);
      if (!result.success) throw new Error(result.error);
      res.json({ success: true, data: task });
    } catch (err) {
      console.error('[KanbanRoute] create error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/kanban/tasks/:id
  app.patch('/api/kanban/tasks/:id', apiRateLimiter, auth, async (req: Request, res: Response) => {
    try {
      const db = await getDatabase();
      const { id: userId, role } = req.user!;
      const taskId = String(req.params.id);
      const existing = db.getPersonalTask(taskId);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      // 非 admin 只能修改自己的任务
      if (role !== 'admin' && existing.user_id !== userId) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
      const { subject, status, active_form, session_name, assigned_to } = req.body;
      const updates: Record<string, unknown> = {};
      if (subject !== undefined) updates.subject = subject;
      if (status !== undefined) updates.status = status;
      if ('active_form' in req.body) updates.active_form = active_form ?? null;
      if ('session_name' in req.body) updates.session_name = session_name ?? null;
      if ('assigned_to' in req.body) updates.assigned_to = assigned_to ?? null;
      const result = db.updatePersonalTask(taskId, updates);
      res.json({ success: result.success });
    } catch (err) {
      console.error('[KanbanRoute] update error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/kanban/tasks/:id
  app.delete('/api/kanban/tasks/:id', apiRateLimiter, auth, async (req: Request, res: Response) => {
    try {
      const db = await getDatabase();
      const { id: userId, role } = req.user!;
      const taskId = String(req.params.id);
      const existing = db.getPersonalTask(taskId);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Task not found' });
        return;
      }
      if (role !== 'admin' && existing.user_id !== userId) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
      const result = db.deletePersonalTask(taskId);
      res.json({ success: result.success });
    } catch (err) {
      console.error('[KanbanRoute] delete error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/kanban/users — 用于分配给下拉（过滤掉占位用户）
  app.get('/api/kanban/users', apiRateLimiter, auth, async (_req: Request, res: Response) => {
    try {
      const db = await getDatabase();
      const result = db.getAllUsers();
      const users = (result.data ?? [])
        .filter((u) => u.id !== DESKTOP_USER_ID)
        .map((u) => ({ id: u.id, username: u.username, role: u.role ?? 'user' }));
      res.json({ success: true, data: users });
    } catch (err) {
      console.error('[KanbanRoute] listUsers error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/kanban/me — 当前登录用户信息（含 role）
  app.get('/api/kanban/me', apiRateLimiter, auth, (req: Request, res: Response) => {
    res.json({ success: true, data: req.user });
  });
}
