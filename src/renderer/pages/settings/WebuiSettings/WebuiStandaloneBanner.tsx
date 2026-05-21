/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';

/** 单机 WebUI 设置页提示：企业版工作区与管理后台是不同入口 */
const WebuiStandaloneBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = isElectronDesktop();
  const { user } = useAuth();
  const {
    loading,
    hasJoinedEnterprise,
    effectiveRole,
    setManagementMode,
    openEnterpriseAdminInBrowser,
  } = useWebuiEnterpriseMode();

  if (loading || !hasJoinedEnterprise) {
    return null;
  }

  const openEnterpriseWorkspace = () => {
    void setManagementMode('enterprise').then(() => {
      void navigate('/sessions');
    });
  };

  const openAdminConsole = () => {
    if (isDesktop) {
      void openEnterpriseAdminInBrowser();
      return;
    }
    void navigate('/enterprise');
  };

  const isAdmin = isEnterpriseAdminRole(effectiveRole ?? user?.role);

  return (
    <Alert
      className='mb-16px'
      type='info'
      content={
        isDesktop
          ? t('settings.webui.standalonePageHintDesktop', {
              defaultValue:
                '此页仅配置本机 WebUI。已加入企业后：「企业版」工作区在会话侧栏切换；组织管理（LDAP、邀请码）请点「管理后台」。',
            })
          : t('settings.webui.standalonePageHint', {
              defaultValue:
                '此页仅配置本机 WebUI。「企业版」工作区与管理后台是独立入口，请使用标题栏版本切换或侧栏管理后台。',
            })
      }
      action={
        <div className='flex flex-col gap-8px items-end'>
          <Button size='small' type='primary' onClick={openEnterpriseWorkspace}>
            {t('settings.webui.openEnterpriseWorkspace', { defaultValue: '进入企业版工作区' })}
          </Button>
          {isAdmin ? (
            <Button size='small' type='outline' onClick={openAdminConsole}>
              {t('settings.webui.openEnterpriseAdmin', { defaultValue: '打开管理后台' })}
            </Button>
          ) : null}
        </div>
      }
    />
  );
};

export default WebuiStandaloneBanner;
