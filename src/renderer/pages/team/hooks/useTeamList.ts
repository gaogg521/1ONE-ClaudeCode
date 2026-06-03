// src/renderer/pages/team/hooks/useTeamList.ts
import { ipcBridge } from '@/common';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import type { TTeam } from '@/common/types/teamTypes';
import { useCallback } from 'react';
import useSWR from 'swr';

export function useTeamList() {
  const { user } = useAuth();
  const { identity, showTeamsFeature } = useEditionFeatures();
  const userId = user?.id ?? identity.userId;
  const tenantId = identity.tenantId;

  const { data: teams = [], mutate } = useSWR<TTeam[]>(
    showTeamsFeature && userId ? `teams/${tenantId}/${userId}` : null,
    () => ipcBridge.team.list.invoke({ userId: userId!, tenantId }),
    { revalidateOnFocus: false }
  );

  const removeTeam = useCallback(
    async (id: string) => {
      await ipcBridge.team.remove.invoke({ id, tenantId });
      localStorage.removeItem(`team-active-slot-${id}`);
      // Clean up failed-agents record for this team
      try {
        const stored = JSON.parse(localStorage.getItem('team-failed-agents') ?? '{}') as Record<string, string[]>;
        delete stored[id];
        localStorage.setItem('team-failed-agents', JSON.stringify(stored));
      } catch {
        // ignore
      }
      await mutate();
    },
    [mutate, tenantId]
  );

  return { teams, mutate, removeTeam };
}
