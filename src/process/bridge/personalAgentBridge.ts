/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import { DigitalEmployeeRunService } from '@process/digitalEmployee/DigitalEmployeeRunService';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { logBridgeError } from './bridgeLog';

function safeProvider<R, P>(fn: (params: P) => Promise<R>) {
  return async (params: P): Promise<R> => {
    try {
      return await fn(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logBridgeError('[personalAgentBridge] provider error', message);
      return { __bridgeError: true, message } as unknown as R;
    }
  };
}

const digitalEmployeeRunService = new DigitalEmployeeRunService(workerTaskManager);

export function initPersonalAgentBridge(repository = new SqlitePersonalAgentRepository()): void {
  ipcBridge.personalAgent.create.provider(safeProvider(async (params) => repository.create(params)));
  ipcBridge.personalAgent.list.provider(
    safeProvider(async ({ ownerUserId }) => repository.findAllByOwner(ownerUserId))
  );
  ipcBridge.personalAgent.get.provider(
    safeProvider(async ({ id, ownerUserId }) => repository.findById(id, ownerUserId))
  );
  ipcBridge.personalAgent.update.provider(
    safeProvider(async ({ id, ownerUserId, updates }) => repository.update(id, updates, ownerUserId))
  );
  ipcBridge.personalAgent.remove.provider(
    safeProvider(async ({ id, ownerUserId }) => {
      await repository.delete(id, ownerUserId);
    })
  );
  ipcBridge.personalAgent.runNow.provider(safeProvider(async (params) => digitalEmployeeRunService.runNow(params)));
}
