/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserNotificationKind = 'issue_comment' | 'issue_escalation' | 'autopilot' | 'task_assigned' | 'lead_alert';

export type UserNotificationRecord = {
  id: string;
  tenant_id: string;
  user_id: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  link_path: string | null;
  metadata: Record<string, unknown> | null;
  read_at: number | null;
  created_at: number;
};

export type CreateUserNotificationInput = {
  tenantId: string;
  userId: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  linkPath?: string;
  metadata?: Record<string, unknown>;
};
