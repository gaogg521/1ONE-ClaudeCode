/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Metadata stored on cron jobs created from Super Assistant Autopilots */
export type AutopilotContext = {
  teamId?: string;
  agentSlotId?: string;
  /** Set when teamId is `personal` — cron runs as this digital employee. */
  personalAgentId?: string;
  ownerUserId?: string;
  requirementId?: string;
  postBackToIssue?: boolean;
  mentionUserIds?: string[];
  skillNames?: string[];
  source?: 'super_assistant';
};
