/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AdminPageWrapper from './components/AdminPageWrapper';
import TeamRuntimeFleetPanel from '@/renderer/pages/superAssistant/components/TeamRuntimeFleetPanel';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { syncFleetWithAdminBackend } from '@/renderer/services/teamRuntimeAdminSync';
import { isElectronDesktop } from '@/renderer/utils/platform';
import useSWR from 'swr';

const AdminTeamRuntimes: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { identity } = useEditionFeatures();
  const tenantId = identity.tenantId;
  const asAdmin = isEnterpriseAdminRole(user?.role);
  const channel = isElectronDesktop() ? 'desktop' : 'browser';

  const { data: nodes, isLoading, mutate } = useSWR(
    user?.id ? `admin-team-runtime/${tenantId}/${asAdmin ? 'admin' : 'member'}` : null,
    () =>
      syncFleetWithAdminBackend({
        tenantId,
        userId: user!.id,
        channel,
        includeOffline: true,
        asAdmin,
      }),
    { refreshInterval: 30_000 }
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <AdminPageWrapper
      title={t('admin.teamRuntimes.title', { defaultValue: '团队运行时' })}
      description={t('admin.teamRuntimes.desc', {
        defaultValue:
          '汇总 C/S 桌面端与 B/S 浏览器端上报的机器名、IP 与已安装 Agent，数据与超级管理员后台同步。',
      })}
    >
      <Card loading={isLoading}>
        <TeamRuntimeFleetPanel
          enabled
          teamIds={undefined}
          nodesOverride={nodes}
          onRefresh={refresh}
          loading={isLoading}
        />
      </Card>
    </AdminPageWrapper>
  );
};

export default AdminTeamRuntimes;
