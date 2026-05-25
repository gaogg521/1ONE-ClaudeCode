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
          title={t('settings.authProviders.enterprisePageTitle', { defaultValue: '认证与邮件' })}
          description={t('settings.authProviders.enterprisePageDesc', {
            defaultValue: '统一管理企业登录接入与组织邮件发信基础设施，认证提供方与邮箱配置在同一层级维护。',
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
