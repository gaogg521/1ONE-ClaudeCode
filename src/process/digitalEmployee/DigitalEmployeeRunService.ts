/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { ipcBridge } from '@/common';
import type { ICronAgentConfig } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolvePersonalAgentCronConfig } from '@/common/digitalEmployee/agentCronConfig';
import { buildPersonalDigitalEmployeeCronPrompt } from '@/common/digitalEmployee/runPrompt';
import {
  appendDigitalEmployeeRunHistory,
  type DigitalEmployeeRunRecord,
} from '@/common/types/digitalEmployeeRunTypes';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
  getConversationTypeForPreset,
} from '@/common/utils/buildAgentConversationParams';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import { mapPersonalAgentToPreset } from '@process/digitalEmployee/resolvePersonalAgentPreset';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { extractLastAssistantReply } from '@process/services/cron/autopilotPostback';
import { conversationServiceSingleton } from '@process/services/conversationServiceSingleton';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { AgentType } from '@process/task/agentTypes';
import { ProcessConfig } from '@process/utils/initStorage';
import { copyFilesToDirectory } from '@process/utils';
import { ACP_ROUTED_PRESET_TYPES } from '@/common/types/acpTypes';

export type DigitalEmployeeRunNowInput = {
  agentId: string;
  ownerUserId: string;
  issue?: { id: string; subject: string; description?: string | null };
};

export type DigitalEmployeeRunNowResult = {
  runId: string;
  conversationId: string;
};

function formatRunTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

async function resolveModelForBackend(backend: string): Promise<TProviderWithModel> {
  const providers = await ProcessConfig.get('model.config');
  const providerList = (providers && Array.isArray(providers) ? providers : []) as unknown as TProviderWithModel[];

  if (backend === 'gemini') {
    const googleAuth = providerList.find((p) => p.platform === 'gemini-with-google-auth' || p.platform === 'gemini');
    if (googleAuth) {
      return { ...googleAuth, useModel: googleAuth.useModel || 'auto' } as TProviderWithModel;
    }
  }

  const match = providerList.find((p) => p.platform === backend || p.id === backend);
  if (match) {
    return { ...match, useModel: match.useModel || 'auto' } as TProviderWithModel;
  }

  if (providerList.length > 0) {
    return { ...providerList[0], useModel: providerList[0].useModel || 'auto' } as TProviderWithModel;
  }

  return {
    id: `${backend}-fallback`,
    name: backend,
    useModel: 'auto',
    platform: backend,
    baseUrl: '',
    apiKey: '',
  } as TProviderWithModel;
}

function getAgentType(config: ICronAgentConfig): AgentType {
  if (config.isPreset && config.presetAgentType) {
    return getConversationTypeForPreset(config.presetAgentType);
  }
  return getConversationTypeForBackend(config.backend);
}

async function extractAssistantSummary(conversationId: string): Promise<string | undefined> {
  const repo = new SqliteConversationRepository();
  const result = await repo.getMessages(conversationId, 0, 12, 'DESC');
  const reply = extractLastAssistantReply(result.data);
  if (!reply) {
    return undefined;
  }
  return reply.length > 240 ? `${reply.slice(0, 237)}…` : reply;
}

export class DigitalEmployeeRunService {
  constructor(
    private readonly taskManager: IWorkerTaskManager,
    private readonly repository = new SqlitePersonalAgentRepository()
  ) {}

  async runNow(input: DigitalEmployeeRunNowInput): Promise<DigitalEmployeeRunNowResult> {
    const agent = await this.repository.findById(input.agentId, input.ownerUserId);
    if (!agent) {
      throw new Error('Personal agent not found');
    }

    const agentConfig = resolvePersonalAgentCronConfig(agent);
    if (!agentConfig) {
      throw new Error('Unable to resolve agent backend for digital employee run');
    }

    const runId = randomUUID();
    const conversation = await this.createRunConversation(agent, agentConfig);
    const conversationId = conversation.id;

    const runRecord: DigitalEmployeeRunRecord = {
      runId,
      conversationId,
      startedAt: Date.now(),
      status: 'running',
    };
    await this.persistRunState(agent, runRecord);

    void this.executeInBackground(agent, agentConfig, conversationId, runId, input.issue);

    return { runId, conversationId };
  }

  private async createRunConversation(agent: PersonalAgent, agentConfig: ICronAgentConfig) {
    const model = await resolveModelForBackend(agentConfig.backend);
    const preset = mapPersonalAgentToPreset(agent);
    const preferredModelId =
      typeof agent.automationConfig?.preferredModelId === 'string'
        ? agent.automationConfig.preferredModelId
        : preset.preferredModelId;

    const isPreset = Boolean(
      agentConfig.isPreset &&
        agentConfig.customAgentId &&
        (agentConfig.backend === 'gemini' ||
          (ACP_ROUTED_PRESET_TYPES as readonly string[]).includes(agentConfig.backend))
    );

    const params = buildAgentConversationParams({
      backend: agentConfig.backend,
      name: `${agent.name} - ${formatRunTimestamp()}`,
      agentName: agent.name,
      workspace: '',
      model,
      cliPath: agentConfig.cliPath,
      customAgentId: agentConfig.customAgentId,
      isPreset,
      presetAgentType: isPreset ? agentConfig.presetAgentType || agentConfig.backend : undefined,
      presetResources: preset.presetContext
        ? { rules: preset.presetContext, enabledSkills: preset.enabledSkills }
        : undefined,
      currentModelId: preferredModelId,
      extra: {
        personalAgentId: agent.id,
        ownerUserId: agent.ownerUserId,
        tenantId: agent.tenantId ?? 'default',
        ...(preset.presetContext
          ? { presetContext: preset.presetContext, presetRules: preset.presetContext }
          : {}),
        ...(preset.enabledSkills?.length ? { enabledSkills: preset.enabledSkills } : {}),
      },
    });

    const conversation = await conversationServiceSingleton.createConversation({
      ...params,
      type: getAgentType(agentConfig),
    });

    ipcBridge.conversation.listChanged.emit({
      conversationId: conversation.id,
      action: 'created',
      source: conversation.source || '1one',
    });

    return conversation;
  }

  private async executeInBackground(
    agent: PersonalAgent,
    agentConfig: ICronAgentConfig,
    conversationId: string,
    runId: string,
    issue?: DigitalEmployeeRunNowInput['issue']
  ): Promise<void> {
    const prompt = buildPersonalDigitalEmployeeCronPrompt(agent, issue ?? null);

    try {
      const task = await this.taskManager.getOrBuildTask(conversationId, { yoloMode: true });
      cronBusyGuard.setProcessing(conversationId, true);

      cronBusyGuard.onceIdle(conversationId, async () => {
        try {
          const summary = await extractAssistantSummary(conversationId);
          await this.finishRun(agent.id, agent.ownerUserId, runId, {
            status: 'success',
            summary,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.finishRun(agent.id, agent.ownerUserId, runId, {
            status: 'failed',
            error: message,
          });
        }
      });

      const workspace = (task as { workspace?: string }).workspace;
      const workspaceFiles = workspace ? await copyFilesToDirectory(workspace, [], false) : [];
      const msgId = randomUUID();

      await task.sendMessage({
        content: prompt,
        input: prompt,
        msg_id: msgId,
        files: workspaceFiles,
        hidden: true,
      });
    } catch (error) {
      cronBusyGuard.setProcessing(conversationId, false);
      const message = error instanceof Error ? error.message : String(error);
      await this.finishRun(agent.id, agent.ownerUserId, runId, {
        status: 'failed',
        error: message,
      });
      throw error;
    }
  }

  private async persistRunState(agent: PersonalAgent, runRecord: DigitalEmployeeRunRecord): Promise<void> {
    const automationConfig = {
      ...agent.automationConfig,
      lastRun: runRecord,
      runHistory: appendDigitalEmployeeRunHistory(agent.automationConfig?.runHistory, runRecord),
    };
    await this.repository.update(agent.id, { automationConfig }, agent.ownerUserId);
  }

  private async finishRun(
    agentId: string,
    ownerUserId: string,
    runId: string,
    patch: Pick<DigitalEmployeeRunRecord, 'status' | 'error' | 'summary'>
  ): Promise<void> {
    const agent = await this.repository.findById(agentId, ownerUserId);
    if (!agent) {
      return;
    }

    const finishedAt = Date.now();
    const updateRecord = (record: DigitalEmployeeRunRecord): DigitalEmployeeRunRecord =>
      record.runId === runId
        ? { ...record, ...patch, finishedAt }
        : record;

    const lastRun = agent.automationConfig?.lastRun;
    const nextLastRun =
      lastRun && lastRun.runId === runId ? updateRecord(lastRun) : lastRun;

    const history = Array.isArray(agent.automationConfig?.runHistory)
      ? agent.automationConfig.runHistory.map(updateRecord)
      : [];

    await this.repository.update(
      agentId,
      {
        automationConfig: {
          ...agent.automationConfig,
          lastRun: nextLastRun,
          runHistory: history,
        },
      },
      ownerUserId
    );
  }
}
