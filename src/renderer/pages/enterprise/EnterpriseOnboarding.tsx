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
            '企业控制台用于组织成员、团队、认证、邮件与邀请码等治理。与单机 WebUI（本机端口、admin 密码）完全分离。',
        })}
      </Typography.Paragraph>
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
