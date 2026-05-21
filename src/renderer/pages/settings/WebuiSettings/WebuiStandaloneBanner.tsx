/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';

/** Shown on standalone WebUI settings only — links to the separate enterprise console. */
const WebuiStandaloneBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = isElectronDesktop();
  const { loading, hasJoinedEnterprise } = useWebuiEnterpriseMode();

  if (loading || !hasJoinedEnterprise) {
    return null;
  }

  const openEnterprise = () => {
    if (isDesktop) {
      void navigate('/enterprise');
      return;
    }
    void navigate('/enterprise');
  };

  return (
    <Alert
      className='mb-16px'
      type='info'
      content={
        isDesktop
          ? t('settings.webui.standalonePageHintDesktop', {
              defaultValue:
                '此页仅配置本机 WebUI（端口、admin 密码等）。企业治理请在侧栏进入「企业控制台」，完整后台需在浏览器中打开。',
            })
          : t('settings.webui.standalonePageHint', {
              defaultValue:
                '此页仅配置本机 WebUI（端口、admin 密码等）。企业成员、LDAP、邀请码等请使用独立的企业控制台。',
            })
      }
      action={
        <Button size='small' type='primary' onClick={openEnterprise}>
          {isDesktop
            ? t('settings.webui.openEnterpriseConsoleDesktop', { defaultValue: '企业控制台' })
            : t('settings.webui.openEnterpriseConsole', { defaultValue: '打开企业控制台' })}
        </Button>
      }
    />
  );
};

export default WebuiStandaloneBanner;
