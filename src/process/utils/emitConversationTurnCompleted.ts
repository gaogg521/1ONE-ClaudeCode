/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AgentStatus } from '@process/task/agentTypes';

type BuildTurnCompletedParams = {
  sessionId: string;
  turnId: string;
  status: AgentStatus | undefined;
  pendingConfirmations: number;
  workspace: string;
  model: TProviderWithModel;
  state?: IConversationTurnCompletedEvent['state'];
};

export function buildConversationTurnCompletedEvent(params: BuildTurnCompletedParams): IConversationTurnCompletedEvent {
  let isProcessing = params.status === 'running' || params.status === 'pending';
  if (params.state === 'ai_generating') {
    isProcessing = true;
  }
  const pendingConfirmations = params.pendingConfirmations;
  const hasPendingConfirmations = pendingConfirmations > 0;
  const canSendMessage = !isProcessing && !hasPendingConfirmations;

  let state: IConversationTurnCompletedEvent['state'] = params.state;
  if (!state) {
    if (hasPendingConfirmations) {
      state = 'ai_waiting_confirmation';
    } else if (isProcessing) {
      state = 'ai_generating';
    } else {
      state = 'ai_waiting_input';
    }
  }

  return {
    sessionId: params.sessionId,
    turnId: params.turnId,
    status: isProcessing ? 'running' : 'finished',
    state,
    detail: '',
    canSendMessage,
    runtime: {
      hasTask: isProcessing,
      taskStatus: params.status,
      isProcessing,
      pendingConfirmations,
      dbStatus: params.status,
    },
    workspace: params.workspace,
    model: {
      platform: params.model.platform,
      name: params.model.name,
      useModel: params.model.useModel,
    },
    lastMessage: {
      content: '',
      createdAt: Date.now(),
    },
  };
}

export function emitConversationTurnCompleted(event: IConversationTurnCompletedEvent): void {
  ipcBridge.conversation.turnCompleted.emit(event);
}

export function emitAionrsTurnCompleted(
  manager: {
    conversation_id: string;
    workspace: string;
    model: TProviderWithModel;
    status: AgentStatus | undefined;
    getConfirmations: () => Array<unknown>;
  },
  turnId: string,
  state?: IConversationTurnCompletedEvent['state']
): void {
  emitAgentTurnCompleted(manager, turnId, state);
}

export type AgentTurnCompletedEmitter = {
  conversation_id: string;
  workspace: string;
  status: AgentStatus | undefined;
  getConfirmations: () => Array<unknown>;
  model?: TProviderWithModel;
  modelPlatform?: string;
  modelId?: string;
};

function resolveTurnCompletedModel(manager: AgentTurnCompletedEmitter): TProviderWithModel {
  if (manager.model?.useModel) {
    return manager.model;
  }
  const platform = manager.modelPlatform ?? 'unknown';
  return {
    id: platform,
    platform,
    name: platform,
    baseUrl: '',
    apiKey: '',
    useModel: manager.modelId ?? '',
  };
}

export function emitAgentTurnCompleted(
  manager: AgentTurnCompletedEmitter,
  turnId: string,
  state?: IConversationTurnCompletedEvent['state']
): void {
  emitConversationTurnCompleted(
    buildConversationTurnCompletedEvent({
      sessionId: manager.conversation_id,
      turnId,
      status: manager.status,
      pendingConfirmations: manager.getConfirmations().length,
      workspace: manager.workspace,
      model: resolveTurnCompletedModel(manager),
      state,
    })
  );
}
