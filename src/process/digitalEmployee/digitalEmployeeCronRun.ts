/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { withFinishedDigitalEmployeeRun, withNewDigitalEmployeeRun } from '@/common/digitalEmployee/runPersistence';
import type { DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';
import type { AutopilotContext } from '@/common/types/autopilotContext';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import { SqliteTeamRepository } from '@process/team/repository/SqliteTeamRepository';

const personalRepo = new SqlitePersonalAgentRepository();
const teamRepo = new SqliteTeamRepository();

/** Persist running state when a super-assistant cron job starts. */
export async function recordDigitalEmployeeCronRunStarted(
  autopilot: AutopilotContext | undefined,
  conversationId: string
): Promise<void> {
  if (!autopilot?.agentSlotId) {
    return;
  }

  const runRecord: DigitalEmployeeRunRecord = {
    runId: randomUUID(),
    conversationId,
    startedAt: Date.now(),
    status: 'running',
  };

  if (autopilot.teamId === 'personal') {
    const agentId = autopilot.personalAgentId ?? autopilot.agentSlotId;
    const ownerUserId = autopilot.ownerUserId ?? DESKTOP_OPERATOR_USER_ID;
    const agent = await personalRepo.findById(agentId, ownerUserId);
    if (!agent) {
      return;
    }
    await personalRepo.update(
      agentId,
      {
        automationConfig: withNewDigitalEmployeeRun(agent.automationConfig, runRecord),
      },
      ownerUserId
    );
    return;
  }

  if (!autopilot.teamId) {
    return;
  }
  const team = await teamRepo.findById(autopilot.teamId);
  if (!team) {
    return;
  }
  const updatedAgents = team.agents.map((agent) =>
    agent.slotId === autopilot.agentSlotId ? withNewDigitalEmployeeRun(agent, runRecord) : agent
  );
  await teamRepo.update(autopilot.teamId, { agents: updatedAgents, updatedAt: Date.now() });
}

/** Mark the in-flight cron run as finished for personal or team digital employees. */
export async function recordDigitalEmployeeCronRunFinished(
  autopilot: AutopilotContext | undefined,
  conversationId: string,
  patch: Pick<DigitalEmployeeRunRecord, 'status' | 'error' | 'summary'>
): Promise<void> {
  if (!autopilot?.agentSlotId) {
    return;
  }

  if (autopilot.teamId === 'personal') {
    const agentId = autopilot.personalAgentId ?? autopilot.agentSlotId;
    const ownerUserId = autopilot.ownerUserId ?? DESKTOP_OPERATOR_USER_ID;
    const agent = await personalRepo.findById(agentId, ownerUserId);
    if (!agent) {
      return;
    }
    await personalRepo.update(
      agentId,
      {
        automationConfig: withFinishedDigitalEmployeeRun(agent.automationConfig, { conversationId }, patch),
      },
      ownerUserId
    );
    return;
  }

  if (!autopilot.teamId) {
    return;
  }
  const team = await teamRepo.findById(autopilot.teamId);
  if (!team) {
    return;
  }
  const updatedAgents = team.agents.map((agent) =>
    agent.slotId === autopilot.agentSlotId ? withFinishedDigitalEmployeeRun(agent, { conversationId }, patch) : agent
  );
  await teamRepo.update(autopilot.teamId, { agents: updatedAgents, updatedAt: Date.now() });
}
