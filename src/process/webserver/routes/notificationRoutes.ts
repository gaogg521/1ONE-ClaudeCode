/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import {
  getUnreadNotificationCount,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@process/services/devops/userNotificationService';

type RegisterNotificationRoutesOptions = {
  rateLimit: RateLimitRequestHandler;
  auth: (req: Request, res: Response, next: () => void) => void;
};

function resolveTenantId(req: Request): string {
  return req.user?.tenant_id ?? 'default';
}

export function registerNotificationRoutes(app: Express, opts: RegisterNotificationRoutesOptions): void {
  const { rateLimit, auth } = opts;

  app.get('/api/notifications', rateLimit, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const userId = req.user!.id;
      const unreadOnly = String(req.query.unreadOnly ?? '') === '1';
      const limit = Number.parseInt(String(req.query.limit ?? '30'), 10);
      const items = await listUserNotifications({ tenantId, userId, limit, unreadOnly });
      res.json(items);
    } catch (error) {
      console.error('[NotificationRoute] list error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.get('/api/notifications/unread-count', rateLimit, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const count = await getUnreadNotificationCount(tenantId, req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error('[NotificationRoute] unread count error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.patch('/api/notifications/:id/read', rateLimit, auth, async (req, res) => {
    try {
      const ok = await markNotificationRead(String(req.params.id), req.user!.id);
      if (!ok) {
        res.status(404).json({ success: false, message: 'Notification not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[NotificationRoute] mark read error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/notifications/read-all', rateLimit, auth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      const updated = await markAllNotificationsRead(tenantId, req.user!.id);
      res.json({ success: true, updated });
    } catch (error) {
      console.error('[NotificationRoute] read all error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}
