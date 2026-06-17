import React from 'react';
import { Button, Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type SettingsTabProps = {
  isAdmin: boolean;
  onOpenEnterpriseConsole: () => void;
  onOpenWebuiSettings: () => void;
};

const SettingsTab: React.FC<SettingsTabProps> = ({ isAdmin, onOpenEnterpriseConsole, onOpenWebuiSettings }) => {
  const { t } = useTranslation();

  return (
    <div className='grid gap-12px md:grid-cols-2'>
      <Card title={t('common.superAssistant.settingsVisibilityTitle', { defaultValue: '可见性与协作边界' })}>
        <div className='text-12px text-t-tertiary'>
          {isAdmin
            ? t('common.superAssistant.settingsVisibilityAdminDesc', {
                defaultValue: '管理员可继续完善角色可见性、组织绑定和模块调用权限。',
              })
            : t('common.superAssistant.settingsVisibilityMemberDesc', {
                defaultValue: '成员在这里查看超级助手的协作边界与入口说明。',
              })}
        </div>
        <div className='mt-12px'>
          <Button size='small' type='primary' onClick={onOpenWebuiSettings}>
            {t('common.superAssistant.openWebuiSettings', { defaultValue: '打开 WebUI 设置' })}
          </Button>
        </div>
      </Card>
      <Card title={t('common.superAssistant.settingsEnterpriseTitle', { defaultValue: '企业模块配置入口' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.settingsEnterpriseDesc', {
            defaultValue: '继续前往现有企业控制台，完善成员、认证、邮件、MCP 和组织治理配置。',
          })}
        </div>
        <div className='mt-12px'>
          <Button size='small' onClick={onOpenEnterpriseConsole}>
            {t('common.superAssistant.openEnterpriseConsole', { defaultValue: '打开企业控制台' })}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SettingsTab;
