/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '@process/services/database';
import { dispatchIssueCommentNotifications } from './enterpriseNotificationService';

export type RequirementCommentAuthorType = 'user' | 'agent' | 'autopilot';

export async function insertRequirementComment(input: {
  tenantId: string;
  requirementId: string;
  authorType: RequirementCommentAuthorType;
  authorId: string | null;
  authorName: string;
  body: string;
  metadata?: Record<string, unknown>;
  notifyUserIds?: string[];
}): Promise<string> {
  const db = await getDatabase();
  const id = randomUUID();
  const now = Date.now();
  db.getDriver()
    .prepare(
      `INSERT INTO requirement_comments
        (id, tenant_id, requirement_id, author_type, author_id, author_name, body, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.tenantId,
      input.requirementId,
      input.authorType,
      input.authorId,
      input.authorName,
      input.body,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now
    );

  void dispatchIssueCommentNotifications({
    tenantId: input.tenantId,
    requirementId: input.requirementId,
    authorType: input.authorType,
    authorName: input.authorName,
    body: input.body,
    explicitUserIds: input.notifyUserIds,
  }).catch((error) => {
    console.warn('[RequirementComment] notification dispatch failed:', error);
  });

  return id;
}

export async function resolveUsernames(userIds: string[]): Promise<Array<{ id: string; username: string }>> {
  if (userIds.length === 0) {
    return [];
  }
  const db = await getDatabase();
  const placeholders = userIds.map(() => '?').join(', ');
  return db
    .getDriver()
    .prepare(`SELECT id, username FROM users WHERE id IN (${placeholders})`)
    .all(...userIds) as Array<{ id: string; username: string }>;
}

export function formatMentionLine(userIds: string[], rows: Array<{ id: string; username: string }>): string {
  const names = userIds
    .map((id) => rows.find((row) => row.id === id)?.username)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) {
    return '';
  }
  return `\n\n---\n${names.map((name) => `@${name}`).join(' ')}`;
}
