/**
 * @license Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

export type IssueAssigneeOption = {
  userId: string;
  label: string;
};

export function useIssueAssigneeOptions(enabled: boolean) {
  const { showTeamsFeature, hasJoinedEnterprise } = useEditionFeatures();
  const [options, setOptions] = useState<IssueAssigneeOption[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !showTeamsFeature || !hasJoinedEnterprise) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const users = await ipcBridge.kanban.listUsers.invoke();
      setOptions(
        users
          .map((item) => ({ userId: item.id, label: item.username }))
          .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
      );
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, hasJoinedEnterprise, showTeamsFeature]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resolveLabel = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) {
        return null;
      }
      return options.find((item) => item.userId === userId)?.label ?? userId;
    },
    [options]
  );

  return { options, loading, reload, resolveLabel };
}
