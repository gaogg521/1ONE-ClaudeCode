/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '@process/services/database';
import { insertRequirementComment } from './requirementCommentService';
import {
  buildEscalationMemberNotification,
  buildLeadEscalationInboxMessage,
  buildSuperAssistantIssueLink,
  notifyEnterpriseUsers,
} from './enterpriseNotificationService';

export type EnterpriseMemberRecord = {
  id: string;
  username: string;
  role?: string;
};

export type EscalateEnterpriseIssueInput = {
  teamId: string;
  agentSlotId: string;
  agentName: string;
  subject: string;
  description?: string;
  blockerReason?: string;
  parentRequirementId?: string;
  assignToAgent?: string;
  assignToMember?: string;
  issueType?: 'story' | 'bug' | 'task';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
};

export type EscalateEnterpriseIssueResult = {
  requirementId: string;
  subject: string;
  assignedMemberId?: string;
  assignedMemberUsername?: string;
  assignedAgentSlotId?: string;
  assignedAgentName?: string;
  teamTaskId?: string;
  kanbanTaskId?: string;
};

type TeamContext = {
  tenantId: string;
  ownerUserId: string;
};

const VALID_ISSUE_TYPES = new Set(['story', 'bug', 'task']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

async function resolveTeamContext(teamId: string): Promise<TeamContext | null> {
  const db = await getDatabase();
  const row = db.getDriver().prepare(`SELECT tenant_id, user_id FROM teams WHERE id = ?`).get(teamId) as
    | { tenant_id: string; user_id: string }
    | undefined;
  if (!row) {
    return null;
  }
  return { tenantId: row.tenant_id, ownerUserId: row.user_id };
}

export async function listEnterpriseMembers(teamId: string, tenantId: string): Promise<EnterpriseMemberRecord[]> {
  const db = await getDatabase();
  const driver = db.getDriver();

  const membershipRows = driver
    .prepare(
      `SELECT u.id, u.username, m.role
       FROM team_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = ? AND m.team_id = ?
       ORDER BY u.username ASC`
    )
    .all(tenantId, teamId) as Array<{ id: string; username: string; role: string }>;

  if (membershipRows.length > 0) {
    return membershipRows.map((row) => ({ id: row.id, username: row.username, role: row.role }));
  }

  return driver
    .prepare(`SELECT id, username FROM users WHERE tenant_id = ? ORDER BY username ASC LIMIT 50`)
    .all(tenantId) as EnterpriseMemberRecord[];
}

async function resolveMemberUserId(
  tenantId: string,
  teamId: string,
  memberRef: string,
  members: EnterpriseMemberRecord[]
): Promise<EnterpriseMemberRecord | undefined> {
  const needle = memberRef.trim().toLowerCase();
  const byId = members.find((member) => member.id === memberRef);
  if (byId) {
    return byId;
  }
  const byUsername = members.find((member) => member.username.toLowerCase() === needle);
  if (byUsername) {
    return byUsername;
  }

  const db = await getDatabase();
  const row = db
    .getDriver()
    .prepare(
      `SELECT u.id, u.username
       FROM users u
       LEFT JOIN team_memberships m ON m.user_id = u.id AND m.team_id = ? AND m.tenant_id = ?
       WHERE u.tenant_id = ? AND (u.id = ? OR LOWER(u.username) = ?)
       LIMIT 1`
    )
    .get(teamId, tenantId, tenantId, memberRef, needle) as { id: string; username: string } | undefined;

  return row ? { id: row.id, username: row.username } : undefined;
}

export async function escalateEnterpriseIssue(
  input: EscalateEnterpriseIssueInput,
  options?: {
    resolveAgentSlotId?: (agentRef: string) => string | undefined;
    createTeamTask?: (payload: {
      teamId: string;
      subject: string;
      description?: string;
      owner?: string;
    }) => Promise<{ id: string }>;
    wakeAgent?: (slotId: string) => Promise<void>;
  }
): Promise<EscalateEnterpriseIssueResult> {
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error('Subject is required');
  }

  const teamContext = await resolveTeamContext(input.teamId);
  if (!teamContext) {
    throw new Error(`Team "${input.teamId}" not found`);
  }

  const issueType = input.issueType && VALID_ISSUE_TYPES.has(input.issueType) ? input.issueType : 'task';
  const priority = input.priority && VALID_PRIORITIES.has(input.priority) ? input.priority : 'high';
  const members = await listEnterpriseMembers(input.teamId, teamContext.tenantId);

  let assignedMember: EnterpriseMemberRecord | undefined;
  if (input.assignToMember) {
    assignedMember = await resolveMemberUserId(teamContext.tenantId, input.teamId, input.assignToMember, members);
    if (!assignedMember) {
      throw new Error(`Member "${input.assignToMember}" not found. Use team_enterprise_members to list assignees.`);
    }
  }

  let assignedAgentSlotId: string | undefined;
  let assignedAgentName: string | undefined;
  if (input.assignToAgent && options?.resolveAgentSlotId) {
    assignedAgentSlotId = options.resolveAgentSlotId(input.assignToAgent);
    if (!assignedAgentSlotId) {
      throw new Error(`Agent teammate "${input.assignToAgent}" not found`);
    }
    assignedAgentName = input.assignToAgent;
  }

  const descriptionParts = [
    input.description?.trim(),
    input.blockerReason ? `阻塞原因：${input.blockerReason.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const db = await getDatabase();
  const driver = db.getDriver();
  const requirementId = randomUUID();
  const now = Date.now();

  driver
    .prepare(
      `INSERT INTO requirements
        (id, tenant_id, parent_id, type, subject, description, status, priority, assigned_to, creator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      requirementId,
      teamContext.tenantId,
      input.parentRequirementId ?? null,
      issueType,
      subject,
      descriptionParts || null,
      'backlog',
      priority,
      assignedMember?.id ?? null,
      teamContext.ownerUserId,
      now,
      now
    );

  let teamTaskId: string | undefined;
  if (assignedAgentSlotId && options?.createTeamTask) {
    const teamTask = await options.createTeamTask({
      teamId: input.teamId,
      subject,
      description: descriptionParts || undefined,
      owner: assignedAgentSlotId,
    });
    teamTaskId = teamTask.id;
    if (options.wakeAgent) {
      await options.wakeAgent(assignedAgentSlotId);
    }
  }

  let kanbanTaskId: string | undefined;
  if (assignedMember) {
    kanbanTaskId = randomUUID();
    driver
      .prepare(
        `INSERT INTO tasks (id, tenant_id, user_id, subject, status, active_form, session_name, assigned_to, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        kanbanTaskId,
        teamContext.tenantId,
        teamContext.ownerUserId,
        subject,
        'pending',
        descriptionParts || null,
        null,
        assignedMember.id,
        now,
        now
      );
  }

  if (input.parentRequirementId) {
    const assigneeSummary = [
      assignedAgentName ? `Agent: ${assignedAgentName}` : null,
      assignedMember ? `成员: @${assignedMember.username}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    await insertRequirementComment({
      tenantId: teamContext.tenantId,
      requirementId: input.parentRequirementId,
      authorType: 'agent',
      authorId: input.agentSlotId,
      authorName: input.agentName,
      body: [
        `🚧 **Agent 升级阻塞** — ${input.agentName} 已创建跟进 Issue`,
        '',
        `- 新 Issue：**${subject}**`,
        assigneeSummary ? `- 分配给：${assigneeSummary}` : '- 分配给：待认领',
        input.blockerReason ? `- 原因：${input.blockerReason.trim()}` : null,
        '',
        `跟进 Issue ID: \`${requirementId}\``,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        kind: 'issue_escalation',
        requirementId,
        teamTaskId,
        kanbanTaskId,
        teamId: input.teamId,
      },
      notifyUserIds: assignedMember ? [assignedMember.id] : undefined,
    });
  }

  if (assignedMember) {
    const message = buildEscalationMemberNotification({
      agentName: input.agentName,
      subject,
      requirementId,
      parentRequirementId: input.parentRequirementId,
      blockerReason: input.blockerReason,
    });
    void notifyEnterpriseUsers(teamContext.tenantId, [assignedMember.id], message, {
      kind: kanbanTaskId ? 'task_assigned' : 'issue_escalation',
      linkPath: kanbanTaskId ? '/tasks' : buildSuperAssistantIssueLink(requirementId),
      metadata: {
        requirementId,
        kanbanTaskId,
        teamTaskId,
        parentRequirementId: input.parentRequirementId,
      },
    }).catch((error) => {
      console.warn('[EnterpriseEscalation] member notification failed:', error);
    });
  }

  if (input.parentRequirementId) {
    const ownerRecipients = [teamContext.ownerUserId].filter((userId) => userId && userId !== assignedMember?.id);
    if (ownerRecipients.length > 0) {
      void notifyEnterpriseUsers(
        teamContext.tenantId,
        ownerRecipients,
        {
          title: `[1ONE] ${input.agentName} 上报 Agent 阻塞`,
          body: buildLeadEscalationInboxMessage({
            agentName: input.agentName,
            subject,
            requirementId,
            parentRequirementId: input.parentRequirementId,
            assignedMemberUsername: assignedMember?.username,
            assignedAgentName,
          }),
        },
        {
          kind: 'lead_alert',
          linkPath: buildSuperAssistantIssueLink(input.parentRequirementId),
          metadata: {
            requirementId,
            parentRequirementId: input.parentRequirementId,
            teamId: input.teamId,
          },
        }
      ).catch((error) => {
        console.warn('[EnterpriseEscalation] owner notification failed:', error);
      });
    }
  }

  return {
    requirementId,
    subject,
    assignedMemberId: assignedMember?.id,
    assignedMemberUsername: assignedMember?.username,
    assignedAgentSlotId,
    assignedAgentName,
    teamTaskId,
    kanbanTaskId,
  };
}
