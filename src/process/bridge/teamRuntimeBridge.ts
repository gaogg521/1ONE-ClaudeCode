/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TeamRuntimeNode, UpsertTeamRuntimeNodeInput } from '@/common/types/teamRuntimeTypes';
import { publishTeamRuntimeToAdminBackend } from '@process/team/TeamRuntimeAdminPublisher';
import { getTeamRuntimeRegistry, type TeamRuntimeRegistry } from '@process/team/TeamRuntimeRegistry';
import { shouldSyncWithEnterpriseApi } from '@/common/config/enterpriseApiOrigins';

const HEARTBEAT_INTERVAL_MS = 60_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatContext: { tenantId: string; userId: string } | null = null;

async function publishHeartbeat(): Promise<void> {
  if (!heartbeatContext) {
    return;
  }
  try {
    const node = await getTeamRuntimeRegistry().publishLocalNode(heartbeatContext);
    if (shouldSyncWithEnterpriseApi(heartbeatContext.tenantId)) {
      await publishTeamRuntimeToAdminBackend({
        tenantId: node.tenantId,
        userId: node.userId,
        machineId: node.machineId,
        displayName: node.displayName,
        hostnames: node.hostnames,
        ipAddresses: node.ipAddresses,
        installedAgents: node.installedAgents,
      });
    }
  } catch (error) {
    console.warn('[teamRuntimeBridge] heartbeat failed:', error instanceof Error ? error.message : String(error));
  }
}

export function startTeamRuntimeHeartbeat(context: { tenantId: string; userId: string }): void {
  heartbeatContext = context;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  void publishHeartbeat();
  heartbeatTimer = setInterval(() => {
    void publishHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopTeamRuntimeHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatContext = null;
}

export function initTeamRuntimeBridge(): void {
  ipcBridge.teamRuntime.publishLocal.provider(async (params) => {
    return getTeamRuntimeRegistry().publishLocalNode(params);
  });

  ipcBridge.teamRuntime.upsert.provider(async (params: UpsertTeamRuntimeNodeInput) => {
    return await getTeamRuntimeRegistry().upsertNode(params);
  });

  ipcBridge.teamRuntime.list.provider(async (params) => {
    return await getTeamRuntimeRegistry().listNodes(params);
  });

  ipcBridge.teamRuntime.startHeartbeat.provider(async (params) => {
    startTeamRuntimeHeartbeat(params);
    return { ok: true };
  });

  ipcBridge.teamRuntime.stopHeartbeat.provider(async () => {
    stopTeamRuntimeHeartbeat();
    return { ok: true };
  });
}

export async function listTeamRuntimeNodesForApi(
  input: Parameters<TeamRuntimeRegistry['listNodes']>[0]
): Promise<TeamRuntimeNode[]> {
  return await getTeamRuntimeRegistry().listNodes(input);
}

export async function upsertTeamRuntimeNodeForApi(input: UpsertTeamRuntimeNodeInput): Promise<TeamRuntimeNode> {
  return await getTeamRuntimeRegistry().upsertNode(input);
}
