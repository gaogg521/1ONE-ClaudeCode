/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Alert, Button, Message, Radio, Typography } from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';

const WebuiManagementModePanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = isElectronDesktop();
  const {
    loading,
    hasJoinedEnterprise,
    managementMode,
    enterpriseContext,
    setManagementMode,
    openEnterpriseAdminInBrowser,
  } = useWebuiEnterpriseMode();

  const launchEnterpriseAdmin = useCallback(async () => {
    const result = await openEnterpriseAdminInBrowser();
    if (result === 'webui_not_running') {
      Message.warning(
        t('settings.webui.joinNeedWebuiRunning', {
          defaultValue: '请先在上方的 WebUI 卡片中启用 WebUI 服务',
        })
      );
      return;
    }
    if (result === 'failed') {
      Message.error(
        t('settings.webui.openEnterpriseFailed', {
          defaultValue: '无法打开浏览器，请手动访问 WebUI 地址',
        })
      );
    }
  }, [openEnterpriseAdminInBrowser, t]);

  const handleModeChange = useCallback(
    (value: WebuiManagementMode) => {
      void setManagementMode(value).then(() => {
        if (value === 'enterprise' && !isDesktop) {
          void navigate('/enterprise');
          return;
        }
        if (value === 'standalone' && !isDesktop) {
          void navigate('/settings/webui');
        }
      });
    },
    [isDesktop, navigate, setManagementMode]
  );

  if (loading || !hasJoinedEnterprise) {
    return null;
  }

  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';

  return (
    <div className='mb-16px p-16px rd-12px border border-border-2 bg-2'>
      <div className='text-14px font-600 text-t-primary mb-4px'>
        {t('settings.webui.managementModeTitle', { defaultValue: '管理模式' })}
      </div>
      <Typography.Paragraph type='secondary' className='text-12px mb-12px'>
        {t('settings.webui.managementModeDesc', {
          defaultValue:
            '默认管理本机 WebUI（启用、端口、本地 admin 与密码）。已加入企业「{{tenant}}」时，可切换到企业版后台管理用户、LDAP、飞书等。',
          tenant: tenantLabel,
        })}
      </Typography.Paragraph>
      <Radio.Group
        type='button'
        value={managementMode}
        onChange={(v) => handleModeChange(v as WebuiManagementMode)}
      >
        <Radio value='standalone'>
          {t('settings.webui.managementModeStandalone', { defaultValue: '单机 WebUI' })}
        </Radio>
        <Radio value='enterprise'>
          {t('settings.webui.managementModeEnterprise', { defaultValue: '企业版管理' })}
        </Radio>
      </Radio.Group>
      {managementMode === 'enterprise' && isDesktop ? (
        <Alert
          className='mt-12px'
          type='info'
          content={t('settings.webui.enterpriseDesktopHint', {
            defaultValue:
              '企业版后台（用户、LDAP、飞书、SMTP 等）需在浏览器中打开 WebUI 并登录企业管理员账号后使用。',
          })}
        />
      ) : null}
      {managementMode === 'enterprise' && isDesktop ? (
        <Button className='mt-12px' type='primary' onClick={() => void launchEnterpriseAdmin()}>
          {t('settings.webui.openEnterpriseInBrowser', { defaultValue: '在浏览器中打开企业后台' })}
        </Button>
      ) : null}
    </div>
  );
};

export default WebuiManagementModePanel;
