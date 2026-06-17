/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { IAgentManager } from '@process/task/IAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { AionrsManager } from '@process/task/AionrsManager';
import { mainError, mainLog } from '@process/utils/mainLogger';

export function providerModelsMatch(
  a: TProviderWithModel | undefined,
  b: TProviderWithModel | undefined
): boolean {
  if (!a || !b) return false;
  return a.id === b.id && a.useModel === b.useModel && a.baseUrl === b.baseUrl && a.apiKey === b.apiKey;
}

async function stopAndKillAionrsTask(
  workerTaskManager: IWorkerTaskManager,
  conversation_id: string,
  existing?: IAgentManager
): Promise<void> {
  if (existing?.type === 'aionrs') {
    try {
      await existing.stop();
    } catch {
      // ignore stop errors while tearing down a broken worker
    }
  }
  workerTaskManager.kill(conversation_id);
}

/**
 * Ensure the cached aionrs worker matches the conversation model in DB and is bootstrapped.
 * Rebuilds the worker when model drift or bootstrap failure is detected.
 */
export async function resolveAionrsTaskForSend(
  conversation_id: string,
  deps: {
    conversationService: IConversationService;
    workerTaskManager: IWorkerTaskManager;
  }
): Promise<IAgentManager> {
  const conversation = await deps.conversationService.getConversation(conversation_id);
  if (!conversation || conversation.type !== 'aionrs') {
    return deps.workerTaskManager.getOrBuildTask(conversation_id);
  }

  const dbModel = (conversation as Extract<TChatConversation, { type: 'aionrs' }>).model;
  let existing = deps.workerTaskManager.getTask(conversation_id);

  if (existing?.type === 'aionrs') {
    const mgr = existing as AionrsManager;
    let bootstrapFailed = false;
    try {
      await mgr.bootstrap;
    } catch {
      bootstrapFailed = true;
    }

    const modelDrifted = dbModel && !providerModelsMatch(mgr.model, dbModel);
    if (bootstrapFailed || modelDrifted) {
      if (modelDrifted) {
        mainLog(
          '[aionrsTaskResolver]',
          `model drift worker=${mgr.model.useModel} db=${dbModel.useModel}, rebuilding`
        );
      } else {
        mainError('[aionrsTaskResolver]', 'bootstrap failed, rebuilding worker');
      }
      await stopAndKillAionrsTask(deps.workerTaskManager, conversation_id, existing);
      existing = undefined;
    }
  }

  const task = await deps.workerTaskManager.getOrBuildTask(conversation_id);
  if (task.type === 'aionrs') {
    await (task as AionrsManager).bootstrap;
  }
  return task;
}
