/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '@process/services/database';
import type {
  CreateUserNotificationInput,
  UserNotificationRecord,
} from '@/common/types/userNotification';

type NotificationRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link_path: string | null;
  metadata: string | null;
  read_at: number | null;
  created_at: number;
};

function rowToRecord(row: NotificationRow): UserNotificationRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    kind: row.kind as UserNotificationRecord['kind'],
    title: row.title,
    body: row.body,
    link_path: row.link_path,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

export async function createUserNotification(input: CreateUserNotificationInput): Promise<UserNotificationRecord> {
  const db = await getDatabase();
  const id = randomUUID();
  const now = Date.now();
  const row: NotificationRow = {
    id,
    tenant_id: input.tenantId,
    user_id: input.userId,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    link_path: input.linkPath ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    read_at: null,
    created_at: now,
  };

  db.getDriver()
    .prepare(
      `INSERT INTO user_notifications
        (id, tenant_id, user_id, kind, title, body, link_path, metadata, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.tenant_id,
      row.user_id,
      row.kind,
      row.title,
      row.body,
      row.link_path,
      row.metadata,
      row.read_at,
      row.created_at
    );

  return rowToRecord(row);
}

export async function listUserNotifications(input: {
  tenantId: string;
  userId: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<UserNotificationRecord[]> {
  const db = await getDatabase();
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const unreadClause = input.unreadOnly ? 'AND read_at IS NULL' : '';
  const rows = db
    .getDriver()
    .prepare(
      `SELECT id, tenant_id, user_id, kind, title, body, link_path, metadata, read_at, created_at
       FROM user_notifications
       WHERE tenant_id = ? AND user_id = ? ${unreadClause}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(input.tenantId, input.userId, limit) as NotificationRow[];

  return rows.map(rowToRecord);
}

export async function getUnreadNotificationCount(tenantId: string, userId: string): Promise<number> {
  const db = await getDatabase();
  const row = db
    .getDriver()
    .prepare(
      `SELECT COUNT(*) as count
       FROM user_notifications
       WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL`
    )
    .get(tenantId, userId) as { count: number };
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  const db = await getDatabase();
  const now = Date.now();
  const result = db
    .getDriver()
    .prepare(`UPDATE user_notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL`)
    .run(now, notificationId, userId);
  return result.changes > 0;
}

export async function markAllNotificationsRead(tenantId: string, userId: string): Promise<number> {
  const db = await getDatabase();
  const now = Date.now();
  const result = db
    .getDriver()
    .prepare(
      `UPDATE user_notifications SET read_at = ?
       WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL`
    )
    .run(now, tenantId, userId);
  return result.changes;
}
