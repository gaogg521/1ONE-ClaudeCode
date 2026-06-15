/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { buildTeamDigitalEmployeeRunPrompt } from '@/common/digitalEmployee/runPrompt';
import { withFinishedDigitalEmployeeRun, withNewDigitalEmployeeRun } from '@/common/digitalEmployee/runPersistence';
import type { DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';
import type { TeamAgent } from '@/common/types/teamTypes';
import { SqliteTeamRepository } from '@process/team/repository/SqliteTeamRepository';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { extractLastAssistantReply } from '@process/services/cron/autopilotPostback';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import type { TeamSession } from '@process/team/TeamSession';

export type TeamDigitalEmployeeRunNowInput = {
  teamId: string;
  tenantId?: string;
  slotId: string;
  issue?: { id: string; subject: string; description?: string | null };
};

export type TeamDigitalEmployeeRunNowResult = {
  runId: string;
  conversationId: string;
};

export type TeamSessionResolver = (teamId: string, tenantId?: string) => Promise<TeamSession>;

export class TeamDigitalEmployeeRunService {
  constructor(
    private readonly resolveSession: TeamSessionResolver,
    private readonly repository = new SqliteTeamRepository()
  ) {}

  async runNow(input: TeamDigitalEmployeeRunNowInput): Promise<TeamDigitalEmployeeRunNowResult> {
    const team = await this.repository.findById(input.teamId, input.tenantId);
    if (!team) {
      throw new Error(`Team "${input.teamId}" not found`);
    }
    const agent = team.agents.find((item) => item.slotId === input.slotId);
    if (!agent) {
      throw new Error(`Agent slot "${input.slotId}" not found`);
    }
    if (!agent.conversationId) {
      throw new Error('Agent has no conversation; ensure team session is initialized');
    }

    const runId = randomUUID();
    const runRecord: DigitalEmployeeRunRecord = {
      runId,
      conversationId: agent.conversationId,
      startedAt: Date.now(),
      status: 'running',
    };
    await this.persistRunStarted(input.teamId, input.tenantId, input.slotId, runRecord);

    void this.executeInBackground(input, agent, runId);

    return { runId, conversationId: agent.conversationId };
  }

  private async persistRunStarted(
    teamId: string,
    tenantId: string | undefined,
    slotId: string,
    runRecord: DigitalEmployeeRunRecord
  ): Promise<void> {
    const team = await this.repository.findById(teamId, tenantId);
    if (!team) {
      return;
    }
    const updatedAgents = team.agents.map((agent) =>
      agent.slotId === slotId ? withNewDigitalEmployeeRun(agent, runRecord) : agent
    );
    await this.repository.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
  }

  private async finishRun(
    teamId: string,
    tenantId: string | undefined,
    slotId: string,
    match: { runId: string; conversationId: string },
    patch: Pick<DigitalEmployeeRunRecord, 'status' | 'error' | 'summary'>
  ): Promise<void> {
    const team = await this.repository.findById(teamId, tenantId);
    if (!team) {
      return;
    }
    const updatedAgents = team.agents.map((agent) =>
      agent.slotId === slotId ? withFinishedDigitalEmployeeRun(agent, match, patch) : agent
    );
    await this.repository.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
  }

  private async executeInBackground(
    input: TeamDigitalEmployeeRunNowInput,
    agent: TeamAgent,
    runId: string
  ): Promise<void> {
    const conversationId = agent.conversationId;
    const prompt = buildTeamDigitalEmployeeRunPrompt(agent, input.issue ?? null);

    try {
      const session = await this.resolveSession(input.teamId, input.tenantId);

      cronBusyGuard.onceIdle(conversationId, async () => {
        try {
          const repo = new SqliteConversationRepository();
          const messagesResult = await repo.getMessages(conversationId, 0, 12, 'DESC');
          const reply = extractLastAssistantReply(messagesResult.data);
          const summary = reply ? (reply.length > 240 ? `${reply.slice(0, 237)}…` : reply) : undefined;
          await this.finishRun(
            input.teamId,
            input.tenantId,
            input.slotId,
            { runId, conversationId },
            {
              status: 'success',
              summary,
            }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.finishRun(
            input.teamId,
            input.tenantId,
            input.slotId,
            { runId, conversationId },
            {
              status: 'failed',
              error: message,
            }
          );
        }
      });

      await session.sendMessageToAgent(input.slotId, prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.finishRun(
        input.teamId,
        input.tenantId,
        input.slotId,
        { runId, conversationId },
        {
          status: 'failed',
          error: message,
        }
      );
      throw error;
    }
  }
}
