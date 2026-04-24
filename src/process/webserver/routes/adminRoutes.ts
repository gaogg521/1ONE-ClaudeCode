/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, NextFunction, Request, Response } from 'express';
import { UserRepository } from '../auth/repository/UserRepository';
import { AuthService } from '../auth/service/AuthService';
import { TokenMiddleware } from '../auth/middleware/TokenMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';

const PROTECTED_IDS = new Set(['system_default_user']);

/** admin-only 中间件 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Admin only' });
    return;
  }
  next();
}

export function registerAdminRoutes(app: Express): void {
  const auth = TokenMiddleware.validateToken({ responseType: 'json' });

  // GET /api/admin/users — 列出所有用户（admin）
  app.get('/api/admin/users', apiRateLimiter, auth, requireAdmin, async (_req, res) => {
    try {
      const users = await UserRepository.listUsers();
      res.json({
        success: true,
        data: users
          .filter((u) => !PROTECTED_IDS.has(u.id))
          .map((u) => ({ id: u.id, username: u.username, role: u.role, created_at: u.created_at, last_login: u.last_login })),
      });
    } catch (err) {
      console.error('[AdminRoute] listUsers error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/admin/users — 创建用户
  app.post('/api/admin/users', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username?.trim() || !password?.trim()) {
        res.status(400).json({ success: false, message: '用户名和密码不能为空' });
        return;
      }
      const existing = await UserRepository.findByUsername(username.trim());
      if (existing) {
        res.status(409).json({ success: false, message: '用户名已存在' });
        return;
      }
      const passwordHash = await AuthService.hashPassword(password);
      const user = await UserRepository.createUserWithRole(username.trim(), passwordHash, role === 'admin' ? 'admin' : 'user');
      res.json({ success: true, data: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      console.error('[AdminRoute] createUser error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/users/:id/role — 修改角色
  app.patch('/api/admin/users/:id/role', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const role = String(req.body.role);
      if (!['user', 'admin'].includes(role)) {
        res.status(400).json({ success: false, message: 'role 必须是 user 或 admin' });
        return;
      }
      if (PROTECTED_IDS.has(id)) {
        res.status(403).json({ success: false, message: '不能修改系统用户' });
        return;
      }
      await UserRepository.setRole(id, role as 'user' | 'admin');
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] setRole error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // PATCH /api/admin/users/:id/password — 重置密码（admin）
  app.patch('/api/admin/users/:id/password', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const password = String(req.body.password ?? '');
      if (!password?.trim()) {
        res.status(400).json({ success: false, message: '密码不能为空' });
        return;
      }
      const passwordHash = await AuthService.hashPassword(password);
      await UserRepository.updatePassword(id, passwordHash);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] resetPassword error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // DELETE /api/admin/users/:id — 删除用户
  app.delete('/api/admin/users/:id', apiRateLimiter, auth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (PROTECTED_IDS.has(id)) {
        res.status(403).json({ success: false, message: '不能删除系统用户' });
        return;
      }
      // 不能删除自己
      if (req.user?.id === id) {
        res.status(400).json({ success: false, message: '不能删除自己的账号' });
        return;
      }
      await UserRepository.deleteUser(id);
      res.json({ success: true });
    } catch (err) {
      console.error('[AdminRoute] deleteUser error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
