/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * 统一 C/S + B/S → 超级管理员后台（组织 WebUI API）同步入口。
 */

import { ipcBridge } from '@/common';
import { webui } from '@/common/adapter/ipcBridge';
import type { TeamRuntimeInstalledAgent, TeamRuntimeNode } from '@/common/types/teamRuntimeTypes';
import { shouldSyncWithEnterpriseApi } from '@/common/config/enterpriseApiOrigins';
import {
  ADMIN_TEAM_RUNTIME_NODES_PATH,
  TEAM_RUNTIME_HEARTBEAT_PATH,
  TEAM_RUNTIME_NODES_PATH,
  type TeamRuntimeClientChannel,
} from '@/common/teamRuntime/syncChannels';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { mergeTeamRuntimeNodes } from '@/renderer/utils/teamRuntimeOrgSync';

const BROWSER_MACHINE_ID_KEY = 'one.browserMachineId';

function getBrowserMachineId(): string {
  if (typeof localStorage === 'undefined') {
    return `browser-${Date.now()}`;
  }
  const existing = localStorage.getItem(BROWSER_MACHINE_ID_KEY);
  if (existing) {
    return existing;
  }
  const created =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `browser-${crypto.randomUUID()}`
      : `browser-${Date.now().toString(36)}`;
  localStorage.setItem(BROWSER_MACHINE_ID_KEY, created);
  return created;
}

async function listInstalledAgentsForChannel(
  channel: TeamRuntimeClientChannel
): Promise<TeamRuntimeInstalledAgent[]> {
  if (channel === 'desktop') {
    return [];
  }
  try {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success && result.data) {
      return result.data.map((agent) => ({
        backend: agent.backend,
        name: agent.name,
        cliPath: agent.cliPath,
      }));
    }
  } catch {
    // WebUI 纯浏览器模式可能无 IPC，由服务端心跳接口补全
  }
  return [];
}

export async function publishRuntimeToAdminBackend(input: {
  tenantId: string;
  userId: string;
  channel: TeamRuntimeClientChannel;
  /** When false (client mode, not yet SSO-signed-in), report as pending device. */
  authenticated?: boolean;
}): Promise<TeamRuntimeNode | null> {
  const authenticated = input.authenticated !== false;
  // Pending devices (client mode, no SSO yet) report under 'pending' tenant so the
  // server-side admin view can surface them. Signed-in members use their real tenant.
  const effectiveTenantId = authenticated ? input.tenantId : 'pending';
  const effectiveUserId = authenticated ? input.userId : 'pending';

  if (!shouldSyncWithEnterpriseApi(effectiveTenantId) && !authenticated) {
    // shouldSyncWithEnterpriseApi rejects 'pending'; but client-mode pending devices
    // must still sync. Only short-circuit when neither enterprise tenant nor client pending.
    if (!effectiveTenantId || effectiveTenantId === 'pending') {
      // continue — client-mode pending device, allow sync
    } else {
      return null;
    }
  }

  if (input.channel === 'desktop' && isElectronDesktop()) {
    const node = await ipcBridge.teamRuntime.publishLocal.invoke({
      tenantId: effectiveTenantId,
      userId: effectiveUserId,
    });
    try {
      await fetchWebuiApiJson<TeamRuntimeNode>(TEAM_RUNTIME_HEARTBEAT_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: node.tenantId,
          userId: node.userId,
          machineId: node.machineId,
          displayName: node.displayName,
          hostnames: node.hostnames,
          ipAddresses: node.ipAddresses,
          installedAgents: node.installedAgents,
          authenticated,
        }),
      });
    } catch {
      // 主进程后台同步仍会通过 heartbeat 重试
    }
    return node;
  }

  const machineId = getBrowserMachineId();
  const displayName =
    typeof window !== 'undefined'
      ? `Web · ${window.location.hostname || 'browser'}`
      : 'Web client';
  const installedAgents = await listInstalledAgentsForChannel('browser');

  try {
    return await fetchWebuiApiJson<TeamRuntimeNode>(TEAM_RUNTIME_HEARTBEAT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: effectiveTenantId,
        userId: effectiveUserId,
        machineId,
        displayName,
        hostnames: [displayName],
        ipAddresses: [],
        installedAgents,
        authenticated,
      }),
    });
  } catch {
    return null;
  }
}

export async function listRuntimeNodesFromAdminBackend(input: {
  tenantId: string;
  teamIds?: string[];
  includeOffline?: boolean;
  asAdmin?: boolean;
}): Promise<TeamRuntimeNode[]> {
  if (!shouldSyncWithEnterpriseApi(input.tenantId)) {
    return [];
  }
  const params = new URLSearchParams();
  if (input.teamIds?.length) {
    params.set('teamIds', input.teamIds.join(','));
  }
  if (input.includeOffline) {
    params.set('includeOffline', 'true');
  }
  const query = params.toString();
  const memberPath = query ? `${TEAM_RUNTIME_NODES_PATH}?${query}` : TEAM_RUNTIME_NODES_PATH;
  const adminPath = query ? `${ADMIN_TEAM_RUNTIME_NODES_PATH}?${query}` : ADMIN_TEAM_RUNTIME_NODES_PATH;

  try {
    if (input.asAdmin) {
      return await fetchWebuiApiJson<TeamRuntimeNode[]>(adminPath);
    }
    return await fetchWebuiApiJson<TeamRuntimeNode[]>(memberPath);
  } catch {
    return [];
  }
}

export async function syncFleetWithAdminBackend(input: {
  tenantId: string;
  userId: string;
  channel: TeamRuntimeClientChannel;
  teamIds?: string[];
  includeOffline?: boolean;
  asAdmin?: boolean;
  authenticated?: boolean;
}): Promise<TeamRuntimeNode[]> {
  await publishRuntimeToAdminBackend({
    tenantId: input.tenantId,
    userId: input.userId,
    channel: input.channel,
    authenticated: input.authenticated,
  });

  let localNodes: TeamRuntimeNode[] = [];
  if (input.channel === 'desktop' && isElectronDesktop()) {
    localNodes = await ipcBridge.teamRuntime.list.invoke({
      tenantId: input.tenantId,
      teamIds: input.teamIds,
      includeOffline: input.includeOffline ?? true,
    });
  }

  const remoteNodes = await listRuntimeNodesFromAdminBackend({
    tenantId: input.tenantId,
    teamIds: input.teamIds,
    includeOffline: input.includeOffline,
    asAdmin: input.asAdmin,
  });

  return mergeTeamRuntimeNodes(localNodes, remoteNodes);
}

/** Persist org API origin for main-process C/S sync (shared ProcessConfig). */
export async function mirrorEnterpriseApiOriginsToMain(origins: string[]): Promise<void> {
  if (!isElectronDesktop()) {
    return;
  }
  try {
    await webui.setEnterpriseApiOrigins.invoke({ origins });
  } catch {
    // optional bridge
  }
}
