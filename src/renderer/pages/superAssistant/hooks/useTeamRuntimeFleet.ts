/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TeamRuntimeNode } from '@/common/types/teamRuntimeTypes';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';
import { syncFleetWithAdminBackend } from '@/renderer/services/teamRuntimeAdminSync';
import { isElectronDesktop } from '@/renderer/utils/platform';

type UseTeamRuntimeFleetOptions = {
  enabled?: boolean;
  teamIds?: string[];
  includeOffline?: boolean;
  refreshIntervalMs?: number;
};

export function useTeamRuntimeFleet(options: UseTeamRuntimeFleetOptions = {}) {
  const { user } = useAuth();
  const { identity, hasJoinedEnterprise } = useEditionFeatures();
  const tenantId = identity.tenantId || 'default';
  const userId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
  const enabled = options.enabled ?? hasJoinedEnterprise;
  const teamIdsKey = (options.teamIds ?? []).join(',');

  const swrKey =
    enabled && userId
      ? `team-runtime-fleet/${tenantId}/${teamIdsKey}/${options.includeOffline ? 'all' : 'online'}`
      : null;

  const channel = isElectronDesktop() ? 'desktop' : 'browser';

  const { data, isLoading, mutate } = useSWR(
    swrKey,
    async () =>
      syncFleetWithAdminBackend({
        tenantId,
        userId,
        channel,
        teamIds: options.teamIds,
        includeOffline: options.includeOffline ?? true,
      }),
    { refreshInterval: options.refreshIntervalMs ?? 30_000 }
  );

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    void ipcBridge.teamRuntime.startHeartbeat.invoke({ tenantId, userId });
    return () => {
      void ipcBridge.teamRuntime.stopHeartbeat.invoke();
    };
  }, [enabled, tenantId, userId]);

  const nodes = data ?? [];
  const stats = useMemo(() => {
    const online = nodes.filter((node) => node.status === 'online').length;
    const offline = nodes.length - online;
    return { total: nodes.length, online, offline };
  }, [nodes]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    nodes,
    stats,
    loading: isLoading,
    refresh,
  };
}

export function groupRuntimeNodesByMachine(nodes: TeamRuntimeNode[]): {
  local: TeamRuntimeNode[];
  remote: TeamRuntimeNode[];
} {
  const hostname = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '';
  const local: TeamRuntimeNode[] = [];
  const remote: TeamRuntimeNode[] = [];
  for (const node of nodes) {
    const isLocal =
      node.hostnames.some((name) => name === hostname) ||
      node.displayName === hostname ||
      (hostname && node.ipAddresses.includes(hostname));
    if (isLocal) {
      local.push(node);
    } else {
      remote.push(node);
    }
  }
  if (local.length === 0 && nodes.length === 1) {
    return { local: nodes, remote: [] };
  }
  return { local, remote };
}
