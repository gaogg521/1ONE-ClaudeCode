import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@arco-design/web-react';
import { Left, SettingTwo } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

const WorkspaceSettings: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const title = useMemo(() => {
    if (location.pathname.includes('/workspace/settings/model')) return t('settings.model', { defaultValue: '模型' });
    if (location.pathname.includes('/workspace/settings/assistants'))
      return t('settings.assistants', { defaultValue: '助手' });
    if (location.pathname.includes('/workspace/settings/tools')) return t('settings.tools', { defaultValue: '工具' });
    if (location.pathname.includes('/workspace/settings/agent')) return t('settings.agent', { defaultValue: 'Agents' });
    return t('workspace.hub.projectSettings', { defaultValue: '项目设置' });
  }, [location.pathname, t]);

  return (
    <div className='h-full w-full overflow-auto px-20px py-16px'>
      <div className='flex items-center justify-between gap-12px mb-12px'>
        <div className='flex items-center gap-10px min-w-0'>
          <Button
            type='text'
            icon={<Left theme='outline' size='16' />}
            onClick={() => {
              void navigate('/workspace');
            }}
          >
            {t('common.back', { defaultValue: '返回' })}
          </Button>
          <div className='flex items-center gap-8px min-w-0'>
            <SettingTwo theme='outline' size='18' />
            <div className='text-16px font-bold text-t-primary truncate'>{title}</div>
          </div>
        </div>
        <Button
          onClick={() => {
            void navigate('/settings');
          }}
        >
          {t('nav.globalSettings', { defaultValue: '全局设置' })}
        </Button>
      </div>

      <div className='flex flex-wrap gap-8px mb-12px'>
        <Button
          size='small'
          type={location.pathname.includes('/workspace/settings/model') ? 'primary' : 'secondary'}
          onClick={() => void navigate('/workspace/settings/model')}
        >
          {t('settings.model', { defaultValue: '模型' })}
        </Button>
        <Button
          size='small'
          type={location.pathname.includes('/workspace/settings/assistants') ? 'primary' : 'secondary'}
          onClick={() => void navigate('/workspace/settings/assistants')}
        >
          {t('settings.assistants', { defaultValue: '助手' })}
        </Button>
        <Button
          size='small'
          type={location.pathname.includes('/workspace/settings/tools') ? 'primary' : 'secondary'}
          onClick={() => void navigate('/workspace/settings/tools')}
        >
          {t('settings.tools', { defaultValue: '工具' })}
        </Button>
        <Button
          size='small'
          type={location.pathname.includes('/workspace/settings/agent') ? 'primary' : 'secondary'}
          onClick={() => void navigate('/workspace/settings/agent')}
        >
          {t('settings.agent', { defaultValue: 'Agents' })}
        </Button>
      </div>

      <div className='rounded-12px bg-[var(--color-bg-1)] border border-solid border-[var(--color-border-2)] p-12px'>
        {children}
      </div>
    </div>
  );
};

export default WorkspaceSettings;

