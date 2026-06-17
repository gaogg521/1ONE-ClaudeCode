/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import TeamRuntimeFleetPanel from '@/renderer/pages/superAssistant/components/TeamRuntimeFleetPanel';
import { useAssistantCollaborationTeams } from '@/renderer/pages/superAssistant/hooks/useAssistantCollaborationTeams';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

const AgentFleetPage: React.FC = () => {
  const { t } = useTranslation();
  const { can } = useEditionFeatures();
  const { teams } = useAssistantCollaborationTeams();

  if (!can('enterprise.workspace')) {
    return <Navigate to='/guid' replace />;
  }

  const fleetTeamIds = teams.map((team) => team.id);

  return (
    <div className='h-full overflow-auto px-20px py-16px'>
      <Card title={t('common.agentFleet.title', { defaultValue: '组织节点' })}>
        <div className='mb-12px text-12px text-t-tertiary'>
          {t('common.agentFleet.desc', {
            defaultValue:
              '查看同组织成员在线的机器名、IP 与已安装 Agent。各端登录组织后会自动上报心跳，无需共用同一台 WebUI。',
          })}
        </div>
        <TeamRuntimeFleetPanel teamIds={fleetTeamIds.length > 0 ? fleetTeamIds : undefined} enabled />
      </Card>
    </div>
  );
};

export default AgentFleetPage;
