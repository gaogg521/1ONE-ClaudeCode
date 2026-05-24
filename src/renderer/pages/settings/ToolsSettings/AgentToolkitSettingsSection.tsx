/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, type IMcpServer } from '@/common/config/storage';
import {
  DEFAULT_AGENT_TOOLKIT_CONFIG,
  type AgentToolkitConfig,
  normalizeAgentToolkitConfig,
} from '@/common/config/agentToolkitConfig';
import { Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMcpServers } from '@/renderer/hooks/mcp';
import { acpConversation, mcpService } from '@/common/adapter/ipcBridge';

const isBuiltinCodegraphServer = (server: IMcpServer) =>
  server.builtin === true && server.id === (ConfigStorage as unknown as Record<string, string>).BUILTIN_CODEGRAPH_ID;

const AgentToolkitSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { mcpServers, saveMcpServers } = useMcpServers();
  const [config, setConfig] = useState<AgentToolkitConfig>(DEFAULT_AGENT_TOOLKIT_CONFIG);
  const [loading, setLoading] = useState(true);

  const codegraphServer = mcpServers.find(isBuiltinCodegraphServer);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await ConfigStorage.get('tools.agentToolkit');
        setConfig(normalizeAgentToolkitConfig(stored));
      } catch (error) {
        console.error('[AgentToolkitSettings] Failed to load config:', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const persist = useCallback(async (next: AgentToolkitConfig) => {
    setConfig(next);
    await ConfigStorage.set('tools.agentToolkit', next);
  }, []);

  const syncCodegraphMcpEnabled = useCallback(
    async (enabled: boolean) => {
      const server = mcpServers.find(isBuiltinCodegraphServer);
      if (!server) return;
      const updated = mcpServers.map((s) =>
        s.id === (ConfigStorage as unknown as Record<string, string>).BUILTIN_CODEGRAPH_ID ? { ...s, enabled, updatedAt: Date.now() } : s
      );
      await saveMcpServers(updated);
    },
    [mcpServers, saveMcpServers]
  );

  const updateField = useCallback(
    async <K extends keyof AgentToolkitConfig>(key: K, value: AgentToolkitConfig[K]) => {
      const next = { ...config, [key]: value };
      if (key === 'enabled' && value === false) {
        await syncCodegraphMcpEnabled(false);
      }
      if (key === 'codegraphEnabled') {
        await syncCodegraphMcpEnabled(Boolean(value) && next.enabled);
      }
      if (key === 'enabled' && value === true && next.codegraphEnabled) {
        await syncCodegraphMcpEnabled(true);
      }
      await persist(next);

      if (next.enabled && next.codegraphEnabled && (key === 'codegraphEnabled' || key === 'enabled')) {
        const agentsRes = await acpConversation.getAvailableAgents.invoke();
        if (agentsRes.success && agentsRes.data) {
          const enabledServers = mcpServers.filter((s) => s.enabled);
          void mcpService.syncMcpToAgents.invoke({
            mcpServers: enabledServers,
            agents: agentsRes.data,
          });
        }
      }
    },
    [config, persist, syncCodegraphMcpEnabled]
  );

  const rows: Array<{
    key: keyof AgentToolkitConfig;
    label: string;
    hint: string;
    disabled?: boolean;
  }> = [
    {
      key: 'enabled',
      label: t('settings.agentToolkit.enabled'),
      hint: t('settings.agentToolkit.enabledHint'),
    },
    {
      key: 'codegraphEnabled',
      label: t('settings.agentToolkit.codegraphEnabled'),
      hint: t('settings.agentToolkit.codegraphEnabledHint'),
      disabled: !config.enabled,
    },
    {
      key: 'codegraphAutoIndex',
      label: t('settings.agentToolkit.codegraphAutoIndex'),
      hint: t('settings.agentToolkit.codegraphAutoIndexHint'),
      disabled: !config.enabled || !config.codegraphEnabled,
    },
    {
      key: 'agentBrowserAutoInstall',
      label: t('settings.agentToolkit.agentBrowserAutoInstall'),
      hint: t('settings.agentToolkit.agentBrowserAutoInstallHint'),
      disabled: !config.enabled,
    },
    {
      key: 'superpowersHooksEnabled',
      label: t('settings.agentToolkit.superpowersHooksEnabled'),
      hint: t('settings.agentToolkit.superpowersHooksEnabledHint'),
      disabled: !config.enabled,
    },
    {
      key: 'injectSkillsForAllAgents',
      label: t('settings.agentToolkit.injectSkillsForAllAgents'),
      hint: t('settings.agentToolkit.injectSkillsForAllAgentsHint'),
      disabled: !config.enabled,
    },
  ];

  if (loading) {
    return null;
  }

  return (
    <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
      <div className='mb-16px'>
        <div className='text-16px font-600 text-t-primary mb-4px'>{t('settings.agentToolkit.title')}</div>
        <div className='text-12px text-t-secondary'>{t('settings.agentToolkit.description')}</div>
        {codegraphServer && (
          <div className='text-12px text-t-tertiary mt-8px'>
            {t('settings.agentToolkit.codegraphMcpStatus', {
              status: codegraphServer.enabled
                ? t('settings.agentToolkit.statusOn')
                : t('settings.agentToolkit.statusOff'),
            })}
          </div>
        )}
      </div>
      <div className='flex flex-col gap-16px'>
        {rows.map((row) => (
          <div key={row.key} className='flex items-start justify-between gap-16px'>
            <div className='flex-1 min-w-0'>
              <div className='text-14px text-t-primary'>{row.label}</div>
              <div className='text-12px text-t-secondary mt-4px'>{row.hint}</div>
            </div>
            <Switch
              checked={config[row.key]}
              disabled={row.disabled}
              onChange={(checked) => void updateField(row.key, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentToolkitSettingsSection;
