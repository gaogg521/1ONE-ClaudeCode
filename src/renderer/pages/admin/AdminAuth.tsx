/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import AuthProvidersModalContent from '@/renderer/components/settings/SettingsModal/contents/AuthProvidersModalContent';
import AdminPageWrapper from './components/AdminPageWrapper';
import ModulePageHeader from './components/ModulePageHeader';

const AdminAuth: React.FC = () => {
  const { t } = useTranslation();

  return (
    <AdminPageWrapper>
      <div className='max-w-960px mx-auto'>
        <ModulePageHeader
          title={t('settings.authProviders.enterprisePageTitle', { defaultValue: '企业认证与邮件' })}
          description={t('settings.authProviders.enterprisePageDesc', {
            defaultValue:
              '仅组织管理员可配置企业 SSO 与邮件发信。默认建议同时只启用一种 SSO，登录页将展示已启用的认证入口。',
          })}
        />
        <AuthProvidersModalContent
          visibleProviders={['ldap', 'feishu', 'dingtalk', 'wecom', 'smtp']}
          defaultActiveTab='ldap'
        />
      </div>
    </AdminPageWrapper>
  );
};

export default AdminAuth;
