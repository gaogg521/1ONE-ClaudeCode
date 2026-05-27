/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';

/** Extract the latest assistant text reply from a conversation transcript. */
export function extractLastAssistantReply(messages: TMessage[]): string {
  for (const message of messages) {
    if (message.type !== 'text' || message.position !== 'left') {
      continue;
    }
    const content = message.content as { content?: string };
    const text = String(content?.content ?? '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

import type { AutopilotContext } from '@/common/types/autopilotContext';
import { AGENT_BLOCKER_ESCALATION_INSTRUCTIONS } from '@/common/types/agentEscalationInstructions';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import { getDatabase } from '@process/services/database';
import { insertRequirementComment, formatMentionLine, resolveUsernames } from '@process/services/devops/requirementCommentService';
import type { CronJob } from './CronStore';

/**
 * After a cron Autopilot run completes, post the agent output as an Issue comment.
 */
export async function postAutopilotResultToIssue(
  job: CronJob,
  conversationId: string,
  conversationRepo: IConversationRepository
): Promise<void> {
  const autopilot = job.metadata.agentConfig?.autopilotContext;
  if (!autopilot?.postBackToIssue || !autopilot.requirementId) {
    return;
  }

  const messagesResult = await conversationRepo.getMessages(conversationId, 0, 40, 'DESC');
  const reply = extractLastAssistantReply(messagesResult.data);
  if (!reply) {
    console.warn(`[AutopilotPostback] No assistant reply for job ${job.id}, skip issue postback`);
    return;
  }

  const db = await getDatabase();
  const requirement = db
    .getDriver()
    .prepare(`SELECT id, tenant_id, assigned_to FROM requirements WHERE id = ?`)
    .get(autopilot.requirementId) as { id: string; tenant_id: string; assigned_to: string | null } | undefined;

  if (!requirement) {
    console.warn(`[AutopilotPostback] Requirement ${autopilot.requirementId} not found`);
    return;
  }

  const mentionIds = [...new Set([...(autopilot.mentionUserIds ?? []), requirement.assigned_to].filter(Boolean))] as string[];
  const users = await resolveUsernames(mentionIds);
  const mentionLine = formatMentionLine(mentionIds, users);

  const body = `🤖 **Autopilot「${job.name}」执行完成**\n\n${reply}${mentionLine}`;

  await insertRequirementComment({
    tenantId: requirement.tenant_id,
    requirementId: requirement.id,
    authorType: 'autopilot',
    authorId: job.id,
    authorName: job.name,
    body,
    notifyUserIds: mentionIds,
    metadata: {
      cronJobId: job.id,
      conversationId,
      teamId: autopilot.teamId,
      agentSlotId: autopilot.agentSlotId,
    },
  });
}

/** Append enterprise skill hints and issue postback instructions to cron prompts. */
export function enrichAutopilotPrompt(basePrompt: string, autopilot?: AutopilotContext): string {
  if (!autopilot) {
    return basePrompt;
  }

  const lines: string[] = [basePrompt.trim()];

  if (autopilot.skillNames?.length) {
    lines.push(
      '',
      '[Enterprise Skills]',
      `Follow these workspace skills when relevant: ${autopilot.skillNames.join(', ')}.`,
      'Use their definitions for metrics, data sources, and output format.'
    );
  }

  if (autopilot.postBackToIssue) {
    lines.push(
      '',
      '[Issue Postback]',
      'Produce a Markdown table or structured summary suitable for posting to the team issue board.',
      'When listing owners, prefix each name with @ (e.g. @张三).',
      'Your output will be posted automatically to the linked Issue when this run completes.'
    );
  }

  if (autopilot.teamId) {
    lines.push('', AGENT_BLOCKER_ESCALATION_INSTRUCTIONS);
    if (autopilot.requirementId) {
      lines.push(`Current linked issue ID for parent_issue_id: \`${autopilot.requirementId}\``);
    }
  }

  return lines.join('\n');
}
