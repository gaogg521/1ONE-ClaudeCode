/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AuthProvidersModalContent from '@/renderer/components/settings/SettingsModal/contents/AuthProvidersModalContent';

const AdminAuth: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='max-w-960px'>
      <Typography.Title heading={5} style={{ marginBottom: 8 }}>
        {t('settings.authProviders.enterprisePageTitle', { defaultValue: '系统配置' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' style={{ marginBottom: 24 }}>
        {t('settings.authProviders.enterprisePageDesc', {
          defaultValue: '在下方分栏中切换并配置各登录方式（LDAP、飞书等，钉钉/企业微信入口已预留），保存前可单独测试连接。',
        })}
      </Typography.Paragraph>
      <AuthProvidersModalContent />
    </div>
  );
};

export default AdminAuth;
