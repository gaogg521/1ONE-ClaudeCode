/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import WebuiJoinEnterprisePanel from '@/renderer/pages/settings/WebuiSettings/WebuiJoinEnterprisePanel';
import EnterpriseEntryPaths from '@/renderer/pages/enterprise/EnterpriseEntryPaths';

const EnterpriseOnboarding: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className='max-w-720px mx-auto py-32px px-16px'>
      <Typography.Title heading={4} className='mt-0 mb-8px'>
        {t('settings.enterpriseConsole.onboardingTitle', { defaultValue: '加入或创建企业' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-24px'>
        {t('settings.enterpriseConsole.onboardingDesc', {
          defaultValue:
            '此处是企业版工作区入口（未加入时）：先登录（LDAP/飞书/本地等），或用邀请码加入。组织管理后台（成员、LDAP、邀请码）在侧栏单独入口，与上方「个人版 / 企业版」切换无关。',
        })}
      </Typography.Paragraph>
      <EnterpriseEntryPaths />
      <Typography.Title heading={6} className='mt-0 mb-8px'>
        {t('settings.enterpriseConsole.inviteSectionTitle', { defaultValue: '邀请码加入（需已登录）' })}
      </Typography.Title>
      <WebuiJoinEnterprisePanel />
      <div className='mt-24px pt-16px border-t border-border-2'>
        <Typography.Paragraph type='secondary' className='mb-12px text-13px'>
          {t('settings.enterpriseConsole.standaloneHint', {
            defaultValue: '仅需配置本机 WebUI 服务？请使用单机远程连接设置。',
          })}
        </Typography.Paragraph>
        <Button type='outline' onClick={() => void navigate('/settings/webui')}>
          {t('settings.enterpriseConsole.goStandaloneWebui', { defaultValue: '前往单机 WebUI 设置' })}
        </Button>
      </div>
    </div>
  );
};

export default EnterpriseOnboarding;
