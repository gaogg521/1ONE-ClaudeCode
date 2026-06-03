/**
 * Collaboration teams for Super Assistant (ipc list + enterprise membership fallback).
 *
 * @license Apache-2.0
 */

import { useMemo } from 'react';
import { ipcBridge } from '@/common';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';
import type { TTeam } from '@/common/types/teamTypes';
import { listTeams, type TeamRecord } from '@/renderer/utils/enterpriseApi/modules';
import useSWR from 'swr';

function toMinimalTeam(record: TeamRecord): TTeam {
  return {
    id: record.id,
    tenantId: record.tenant_id,
    userId: record.user_id,
    name: record.name,
    workspace: record.workspace,
    workspaceMode: (record.workspace_mode === 'isolated' ? 'isolated' : 'shared') as TTeam['workspaceMode'],
    leadAgentId: '',
    agents: [],
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function useAssistantCollaborationTeams() {
  const { user } = useAuth();
  const { identity, showTeamsFeature, hasJoinedEnterprise } = useEditionFeatures();
  const { teams: ipcTeams, mutate: mutateIpcTeams } = useTeamList();
  const userId = user?.id ?? identity.userId;
  const tenantId = identity.tenantId;

  const { data: enterpriseTeams = [], mutate: mutateEnterpriseTeams } = useSWR<TeamRecord[]>(
    showTeamsFeature && hasJoinedEnterprise && userId ? `assistant-enterprise-teams/${tenantId}/${userId}` : null,
    () => listTeams(),
    { revalidateOnFocus: false }
  );

  const teams = useMemo(() => {
    if (ipcTeams.length > 0) {
      return ipcTeams;
    }
    return enterpriseTeams.map(toMinimalTeam);
  }, [enterpriseTeams, ipcTeams]);

  const refresh = async () => {
    await Promise.all([mutateIpcTeams(), mutateEnterpriseTeams()]);
  };

  const hydrateTeam = async (teamId: string): Promise<TTeam | null> => {
    const cached = teams.find((team) => team.id === teamId);
    if (cached && cached.agents.length > 0) {
      return cached;
    }
    try {
      return await ipcBridge.team.get.invoke({ id: teamId, tenantId });
    } catch {
      return cached ?? null;
    }
  };

  return {
    teams,
    hasCollaborationTeam: teams.length > 0,
    canUseWorkspaceVisibility: showTeamsFeature && teams.length > 0,
    showTeamsFeature,
    hasJoinedEnterprise,
    refresh,
    hydrateTeam,
  };
}
