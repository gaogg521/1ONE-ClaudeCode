import { ipcBridge } from '@/common';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

export const OpenClawModelSelector: React.FC<{
  conversationId: string;
  selectedModel?: string;
  onSelectModel: (modelId: string) => void;
}> = ({ conversationId, selectedModel, onSelectModel }) => {
  const { t } = useTranslation();

  const { data } = useSWR(`openclaw.models.${conversationId}`, async () => {
    const res = await ipcBridge.openclawConversation.getModels.invoke();
    return res?.success ? (res.data ?? []) : [];
  });

  const models = data ?? [];

  const buttonLabel = useMemo(() => {
    if (selectedModel) return selectedModel;
    return t('common.defaultModel', { defaultValue: '默认模型' });
  }, [selectedModel, t]);

  if (!models || models.length === 0) {
    return (
      <Tooltip
        content={t('conversation.welcome.modelSwitchNotSupported', { defaultValue: '该会话暂不支持切换模型' })}
        position='top'
      >
        <Button className={'sendbox-model-btn'} shape='round' size='small' style={{ cursor: 'default' }}>
          <span className='flex items-center gap-6px min-w-0'>
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
            <span>{buttonLabel}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu selectedKeys={selectedModel ? [selectedModel] : []}>
          {models.map((m) => (
            <Menu.Item
              key={m.id}
              className={m.id === selectedModel ? '!bg-2' : ''}
              onClick={() => onSelectModel(m.id)}
            >
              <div className='flex items-center justify-between gap-12px'>
                <span>{m.name || m.id}</span>
                {m.provider ? <span className='text-12px text-t-tertiary'>{m.provider}</span> : null}
              </div>
            </Menu.Item>
          ))}
        </Menu>
      }
    >
      <Button className={'sendbox-model-btn'} shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0'>
          <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
          <span>{buttonLabel}</span>
          <Down theme='outline' size='12' fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

