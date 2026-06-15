/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import nodemailer from 'nodemailer';
import { getDatabase } from '@process/services/database';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import { resolveSmtpConfig } from '@process/webserver/auth/smtpConfig';
import { getFeishuTenantAccessToken, sendFeishuTextMessage } from './feishuImService';
import { createUserNotification } from './userNotificationService';
import type { UserNotificationKind } from '@/common/types/userNotification';
import type { RequirementCommentAuthorType } from './requirementCommentService';

export type IssueNotificationPayload = {
  tenantId: string;
  requirementId: string;
  authorType: RequirementCommentAuthorType;
  authorName: string;
  body: string;
  title?: string;
  explicitUserIds?: string[];
};

export type NotificationDeliveryResult = {
  userId: string;
  channel: 'in_app' | 'feishu' | 'email' | 'skipped';
  ok: boolean;
};

export type EnterpriseNotifyOptions = {
  kind: UserNotificationKind;
  linkPath?: string;
  metadata?: Record<string, unknown>;
};

export function buildSuperAssistantIssueLink(requirementId: string): string {
  return `/super-assistant?issueId=${encodeURIComponent(requirementId)}`;
}

/** Parse @username mentions from issue comment bodies. */
export function parseMentionUsernames(body: string): string[] {
  const matches = body.matchAll(/@([A-Za-z0-9_\u4e00-\u9fa5.-]+)/g);
  return [...new Set([...matches].map((match) => match[1]?.trim()).filter(Boolean))] as string[];
}

async function resolveUsersByUsernames(
  tenantId: string,
  usernames: string[]
): Promise<Array<{ id: string; username: string; email?: string }>> {
  if (usernames.length === 0) {
    return [];
  }
  const db = await getDatabase();
  const driver = db.getDriver();
  const lowered = usernames.map((name) => name.toLowerCase());
  const placeholders = lowered.map(() => '?').join(', ');
  return driver
    .prepare(
      `SELECT id, username, email
       FROM users
       WHERE tenant_id = ? AND LOWER(username) IN (${placeholders})`
    )
    .all(tenantId, ...lowered) as Array<{ id: string; username: string; email?: string }>;
}

async function resolveUsersByIds(userIds: string[]): Promise<Array<{ id: string; username: string; email?: string }>> {
  if (userIds.length === 0) {
    return [];
  }
  const db = await getDatabase();
  const placeholders = userIds.map(() => '?').join(', ');
  return db
    .getDriver()
    .prepare(`SELECT id, username, email FROM users WHERE id IN (${placeholders})`)
    .all(...userIds) as Array<{ id: string; username: string; email?: string }>;
}

async function notifyUser(
  tenantId: string,
  user: { id: string; username: string; email?: string },
  message: { title: string; body: string },
  options: EnterpriseNotifyOptions
): Promise<NotificationDeliveryResult[]> {
  const results: NotificationDeliveryResult[] = [];

  try {
    await createUserNotification({
      tenantId,
      userId: user.id,
      kind: options.kind,
      title: message.title,
      body: message.body,
      linkPath: options.linkPath,
      metadata: options.metadata,
    });
    results.push({ userId: user.id, channel: 'in_app', ok: true });
  } catch (error) {
    console.warn('[EnterpriseNotify] in-app notification failed:', error);
    results.push({ userId: user.id, channel: 'in_app', ok: false });
  }

  const feishuToken = await getFeishuTenantAccessToken();
  if (feishuToken) {
    const identities = await AuthIdentityRepository.listForUsers([user.id]);
    const feishuIdentity = identities.find((item) => item.provider === 'feishu');
    if (feishuIdentity?.external_id) {
      const ok = await sendFeishuTextMessage({
        receiveId: feishuIdentity.external_id,
        receiveIdType: feishuToken.receiveIdType,
        text: `${message.title}\n\n${message.body}`,
        tenantAccessToken: feishuToken.token,
      });
      if (ok) {
        results.push({ userId: user.id, channel: 'feishu', ok: true });
        return results;
      }
    }
  }

  const email = user.email?.trim();
  if (email) {
    const smtp = await resolveSmtpConfig();
    if (smtp) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: { user: smtp.user, pass: smtp.pass },
        });
        await transporter.sendMail({
          from: smtp.from,
          to: email,
          subject: message.title,
          text: message.body,
        });
        results.push({ userId: user.id, channel: 'email', ok: true });
        return results;
      } catch (error) {
        console.warn('[EnterpriseNotify] email failed:', error);
      }
    }
  }

  results.push({ userId: user.id, channel: 'skipped', ok: false });
  return results;
}

export async function notifyEnterpriseUsers(
  tenantId: string,
  userIds: string[],
  message: { title: string; body: string },
  options: EnterpriseNotifyOptions
): Promise<NotificationDeliveryResult[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }
  const users = await resolveUsersByIds(uniqueIds);
  const results: NotificationDeliveryResult[] = [];
  for (const user of users) {
    results.push(...(await notifyUser(tenantId, user, message, options)));
  }
  return results;
}

export async function dispatchIssueCommentNotifications(
  payload: IssueNotificationPayload
): Promise<NotificationDeliveryResult[]> {
  const mentionNames = parseMentionUsernames(payload.body);
  const mentionedUsers = await resolveUsersByUsernames(payload.tenantId, mentionNames);
  const explicitUsers = await resolveUsersByIds(payload.explicitUserIds ?? []);
  const recipients = [...new Map([...mentionedUsers, ...explicitUsers].map((user) => [user.id, user])).values()];

  if (recipients.length === 0) {
    return [];
  }

  const title =
    payload.title ??
    (payload.authorType === 'autopilot'
      ? `Autopilot 更新了 Issue`
      : payload.authorType === 'agent'
        ? `${payload.authorName} 在 Issue 中提到了你`
        : 'Issue 有新动态');

  const body = [
    payload.authorName ? `来自：${payload.authorName}` : null,
    payload.body.trim(),
    '',
    `Issue ID: ${payload.requirementId}`,
  ]
    .filter(Boolean)
    .join('\n');

  const results: NotificationDeliveryResult[] = [];
  const kind: UserNotificationKind = payload.authorType === 'autopilot' ? 'autopilot' : 'issue_comment';
  const linkPath = buildSuperAssistantIssueLink(payload.requirementId);

  for (const user of recipients) {
    results.push(
      ...(await notifyUser(
        payload.tenantId,
        user,
        {
          title,
          body,
        },
        {
          kind,
          linkPath,
          metadata: {
            requirementId: payload.requirementId,
            authorType: payload.authorType,
          },
        }
      ))
    );
  }
  return results;
}

export function buildEscalationMemberNotification(input: {
  agentName: string;
  subject: string;
  requirementId: string;
  parentRequirementId?: string;
  blockerReason?: string;
}): { title: string; body: string } {
  return {
    title: `[1ONE] ${input.agentName} 分配了新任务给你`,
    body: [
      `任务：${input.subject}`,
      input.blockerReason ? `背景：${input.blockerReason}` : null,
      input.parentRequirementId ? `来源 Issue: ${input.parentRequirementId}` : null,
      `跟进 Issue ID: ${input.requirementId}`,
      '',
      '请在 WebUI「任务」或 CTeam 查看详情。',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildLeadEscalationInboxMessage(input: {
  agentName: string;
  subject: string;
  requirementId: string;
  parentRequirementId?: string;
  assignedMemberUsername?: string;
  assignedAgentName?: string;
}): string {
  return [
    `[Blocker Escalation] ${input.agentName} 创建了跟进 Issue`,
    `标题：${input.subject}`,
    `Issue ID: ${input.requirementId}`,
    input.parentRequirementId ? `父 Issue: ${input.parentRequirementId}` : null,
    input.assignedMemberUsername ? `已派给成员：@${input.assignedMemberUsername}` : null,
    input.assignedAgentName ? `已派给 Agent：${input.assignedAgentName}` : null,
    '',
    '请协调下一步：重新分配、解除阻塞或合并 Issue。',
  ]
    .filter(Boolean)
    .join('\n');
}
