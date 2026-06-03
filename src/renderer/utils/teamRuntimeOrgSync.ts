/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamRuntimeNode, UpsertTeamRuntimeNodeInput } from '@/common/types/teamRuntimeTypes';
import { shouldSyncWithEnterpriseApi } from '@/common/config/enterpriseApiOrigins';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';

function nodeToHeartbeatPayload(node: TeamRuntimeNode): UpsertTeamRuntimeNodeInput {
  return {
    tenantId: node.tenantId,
    userId: node.userId,
    machineId: node.machineId,
    displayName: node.displayName,
    hostnames: node.hostnames,
    ipAddresses: node.ipAddresses,
    installedAgents: node.installedAgents,
  };
}

/**
 * Push a local runtime node to the organization API.
 * Works when members joined the same org via invite code, email, LDAP, or Feishu SSO —
 * as long as they use the same organization server URL (remembered after login/join).
 */
export async function syncTeamRuntimeNodeToOrg(
  node: TeamRuntimeNode,
  tenantId: string
): Promise<void> {
  if (!shouldSyncWithEnterpriseApi(tenantId)) {
    return;
  }
  try {
    await fetchWebuiApiJson<TeamRuntimeNode>('/api/team-runtime/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeToHeartbeatPayload(node)),
    });
  } catch {
    // Best-effort; local registry remains available offline.
  }
}

export async function listTeamRuntimeNodesFromOrg(input: {
  tenantId: string;
  teamIds?: string[];
  includeOffline?: boolean;
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
  const path = query ? `/api/team-runtime/nodes?${query}` : '/api/team-runtime/nodes';
  try {
    return await fetchWebuiApiJson<TeamRuntimeNode[]>(path);
  } catch {
    return [];
  }
}

export function mergeTeamRuntimeNodes(local: TeamRuntimeNode[], remote: TeamRuntimeNode[]): TeamRuntimeNode[] {
  const map = new Map<string, TeamRuntimeNode>();
  for (const node of [...local, ...remote]) {
    const existing = map.get(node.id);
    if (!existing || node.lastSeenAt > existing.lastSeenAt) {
      map.set(node.id, node);
    }
  }
  return [...map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}
