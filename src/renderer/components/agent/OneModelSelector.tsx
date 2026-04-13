/**
 * 1ONE CODE model selector (provider-based, like Gemini/Aionrs).
 *
 * Unlike ACP CLI backends, 1ONE CODE model list comes from Settings → Models (`model.config`)
 * and should NOT depend on sending a first message.
 */

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { AuthType } from '@office-ai/aioncli-core';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import MarqueePillLabel from './MarqueePillLabel';

const COMPOUND_SEP = '::one::';

function buildId(providerId: string, modelName: string): string {
  return `${providerId}${COMPOUND_SEP}${modelName}`;
}

export const OneModelSelector: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const { t } = useTranslation();
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [currentModelLabel, setCurrentModelLabel] = useState<string | null>(null);

  const { data: modelConfig } = useSWR<IProvider[]>('model.config', () => ipcBridge.mode.getModelConfig.invoke());

  // Load current selection (if already set for this conversation)
  useEffect(() => {
    let cancelled = false;
    ipcBridge.acpConversation.getModelInfo
      .invoke({ conversationId })
      .then((res) => {
        if (cancelled) return;
        const info = res.success ? res.data?.modelInfo : null;
        if (info?.currentModelId) {
          setCurrentModelId(info.currentModelId);
          setCurrentModelLabel(info.currentModelLabel ?? info.currentModelId);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const availableModels = useMemo(() => {
    const providers = Array.isArray(modelConfig) ? modelConfig : [];
    const out: Array<{ id: string; label: string; providerId: string; modelName: string; health?: string }> = [];
    for (const p of providers) {
      if (p.enabled === false) continue;
      for (const m of p.model || []) {
        if (p.modelEnabled?.[m] === false) continue;
        const authType = getProviderAuthType({ platform: p.platform, authType: (p as any).authType, modelProtocols: p.modelProtocols, useModel: m });
        if (authType !== AuthType.USE_OPENAI) continue;
        out.push({
          id: buildId(p.id, m),
          label: `${p.name} · ${m}`,
          providerId: p.id,
          modelName: m,
          health: p.modelHealth?.[m]?.status,
        });
      }
    }
    return out;
  }, [modelConfig]);

  useEffect(() => {
    // Debug aid: helps diagnose why dropdown is empty in dev.
    // eslint-disable-next-line no-console
    console.log('[OneModelSelector] render', {
      conversationId,
      providers: Array.isArray(modelConfig) ? modelConfig.length : null,
      availableModels: availableModels.length,
      firstProvider: Array.isArray(modelConfig) && modelConfig.length > 0 ? { id: modelConfig[0].id, platform: modelConfig[0].platform } : null,
    });
  }, [availableModels.length, conversationId, modelConfig]);

  const handleSelect = useCallback(
    async (modelId: string) => {
      setCurrentModelId(modelId);
      const match = availableModels.find((x) => x.id === modelId);
      if (match) setCurrentModelLabel(match.label);
      try {
        await ipcBridge.acpConversation.setModel.invoke({ conversationId, modelId });
      } catch {
        // ignore
      }
    },
    [availableModels, conversationId]
  );

  const displayLabel =
    currentModelLabel || currentModelId || t('common.defaultModel', { defaultValue: '默认模型' });

  const hasDropdown = availableModels.length > 0;

  if (!hasDropdown) {
    return (
      <Tooltip
        content={
          <div className='max-w-260px space-y-6px'>
            <div>{t('conversation.welcome.modelSwitchNotSupported')}</div>
            <div className='text-11px text-t-tertiary'>
              OneModelSelector: providers={Array.isArray(modelConfig) ? modelConfig.length : 'null'}, availableModels=
              {availableModels.length}
            </div>
          </div>
        }
        position='top'
      >
        <Button className='sendbox-model-btn header-model-btn agent-mode-compact-pill' shape='round' size='small'>
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            <MarqueePillLabel>{displayLabel}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          {availableModels.map((m) => {
            return (
              <Menu.Item
                key={m.id}
                className={m.id === currentModelId ? '!bg-2' : ''}
                onClick={() => void handleSelect(m.id)}
              >
                {m.label}
              </Menu.Item>
            );
          })}
        </Menu>
      }
    >
      <Button className='sendbox-model-btn header-model-btn agent-mode-compact-pill' shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          <MarqueePillLabel>{displayLabel}</MarqueePillLabel>
        </span>
      </Button>
    </Dropdown>
  );
};

export default OneModelSelector;

