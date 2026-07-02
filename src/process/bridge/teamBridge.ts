/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TeamSessionService } from '@process/team/TeamSessionService';
import { logBridgeError } from './bridgeLog';

/**
 * Wrap an async provider handler so that unhandled rejections are caught and
 * logged instead of silently swallowed by the platform bridge (which only
 * chains `.then()` without `.catch()` on the provider callback).
 *
 * Returning `{ __bridgeError: true, message }` unblocks the renderer-side
 * `invoke()` promise so the UI never "freezes".
 */
function safeProvider<R, P>(fn: (params: P) => Promise<R>) {
  return async (params: P): Promise<R> => {
    try {
      return await fn(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logBridgeError('[teamBridge] provider error', message);
      // Return a sentinel the renderer can detect
      return { __bridgeError: true, message } as unknown as R;
    }
  };
}

let _teamSessionService: TeamSessionService | null = null;

export function initTeamBridge(teamSessionService: TeamSessionService): void {
  _teamSessionService = teamSessionService;
  ipcBridge.team.create.provider(
    safeProvider(async (params) => {
      return teamSessionService.createTeam(params);
    })
  );

  ipcBridge.team.list.provider(
    safeProvider(async ({ userId, tenantId }) => {
      return teamSessionService.listTeams(userId, tenantId);
    })
  );

  ipcBridge.team.get.provider(
    safeProvider(async ({ id, tenantId }) => {
      return teamSessionService.getTeam(id, tenantId);
    })
  );

  ipcBridge.team.remove.provider(
    safeProvider(async ({ id, tenantId }) => {
      await teamSessionService.deleteTeam(id, tenantId);
    })
  );

  ipcBridge.team.addAgent.provider(
    safeProvider(async ({ teamId, tenantId, agent }) => {
      return teamSessionService.addAgent(teamId, agent, tenantId);
    })
  );

  ipcBridge.team.removeAgent.provider(
    safeProvider(async ({ teamId, tenantId, slotId }) => {
      await teamSessionService.removeAgent(teamId, slotId, tenantId);
    })
  );

  ipcBridge.team.renameAgent.provider(
    safeProvider(async ({ teamId, tenantId, slotId, newName }) => {
      await teamSessionService.renameAgent(teamId, slotId, newName, tenantId);
    })
  );

  ipcBridge.team.updateAgentSkillIds.provider(
    safeProvider(async ({ teamId, tenantId, slotId, skillIds }) => {
      await teamSessionService.updateAgentSkillIds(teamId, slotId, skillIds, tenantId);
    })
  );

  ipcBridge.team.renameTeam.provider(
    safeProvider(async ({ id, tenantId, name }) => {
      await teamSessionService.renameTeam(id, name, tenantId);
    })
  );

  ipcBridge.team.sendMessage.provider(
    safeProvider(async ({ teamId, tenantId, content, files }) => {
      await teamSessionService.sendMessage(teamId, content, tenantId, files);
    })
  );

  ipcBridge.team.sendMessageToAgent.provider(
    safeProvider(async ({ teamId, tenantId, slotId, content, files }) => {
      await teamSessionService.sendMessageToAgent(teamId, slotId, content, tenantId, files);
    })
  );

  ipcBridge.team.stop.provider(
    safeProvider(async ({ teamId }) => {
      await teamSessionService.stopSession(teamId);
    })
  );

  ipcBridge.team.runDigitalEmployeeNow.provider(
    safeProvider(async ({ teamId, tenantId, slotId, issue }) => {
      return teamSessionService.runDigitalEmployeeNow({ teamId, tenantId, slotId, issue });
    })
  );

  ipcBridge.team.ensureSession.provider(
    safeProvider(async ({ teamId, tenantId }) => {
      try {
        await teamSessionService.getOrStartSession(teamId, tenantId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logBridgeError('[teamBridge] ensureSession failed', [message, error]);
        try {
          const team = await teamSessionService.getTeam(teamId, tenantId);
          for (const agent of team.agents) {
            ipcBridge.team.agentStatusChanged.emit({
              teamId,
              slotId: agent.slotId,
              status: 'failed',
              lastMessage: message,
            });
          }
        } catch (emitErr) {
          logBridgeError('[teamBridge] ensureSession failed (also failed to emit status)', emitErr);
        }
        throw error;
      }
    })
  );
}

/** Stop all active team sessions (TCP servers + child processes). Call on app quit. */
export function disposeAllTeamSessions(): Promise<void> {
  return _teamSessionService?.stopAllSessions() ?? Promise.resolve();
}
