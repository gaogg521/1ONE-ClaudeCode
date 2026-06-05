/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tabs, Message } from '@arco-design/web-react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import LocalAgents from '@/renderer/pages/settings/AgentSettings/LocalAgents';
import RemoteAgents from '@/renderer/pages/settings/AgentSettings/RemoteAgents';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

type AgentTab = 'local' | 'remote';

function parseAgentTab(raw: string | null): AgentTab {
  return raw === 'remote' ? 'remote' : 'local';
}

const AgentModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseAgentTab(searchParams.get('tab'));

  const handleTabChange = useCallback(
    (key: string) => {
      const next = parseAgentTab(key);
      if (next === parseAgentTab(searchParams.get('tab'))) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      if (next === 'local') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return (
    <div className='flex flex-col h-full w-full'>
      {agentMessageContext}

      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        type='line'
        className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'
      >
        <Tabs.TabPane key='local' title={t('settings.agentManagement.localAgents')}>
          <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
            {activeTab === 'local' ? <LocalAgents /> : null}
          </AionScrollArea>
        </Tabs.TabPane>
        <Tabs.TabPane key='remote' title={t('settings.agentManagement.remoteAgents')}>
          <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
            {activeTab === 'remote' ? <RemoteAgents /> : null}
          </AionScrollArea>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default AgentModalContent;
