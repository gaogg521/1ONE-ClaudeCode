/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { listTeams, type TeamRecord } from '@/renderer/utils/enterpriseApi/modules';

export function useTeamNameMap(): {
  getTeamName: (teamId: string | null | undefined) => string;
  teams: TeamRecord[];
  teamsLoading: boolean;
} {
  const teamsState = useEnterpriseAsyncData(listTeams, [], '');

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamsState.data) {
      map.set(team.id, team.name);
    }
    return map;
  }, [teamsState.data]);

  const getTeamName = (teamId: string | null | undefined): string => {
    if (!teamId) {
      return '—';
    }
    return teamNameById.get(teamId) ?? teamId;
  };

  return { getTeamName, teams: teamsState.data, teamsLoading: teamsState.loading };
}
