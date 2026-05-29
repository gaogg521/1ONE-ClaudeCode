/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type EnterpriseRouteErrorFallbackProps = {
  error: Error;
  reset: () => void;
};

const EnterpriseRouteErrorFallback: React.FC<EnterpriseRouteErrorFallbackProps> = ({ error, reset }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card bordered={false} className='max-w-640px'>
      <Typography.Title heading={5} className='mt-0 mb-8px'>
        {t('settings.enterpriseConsole.routeErrorTitle', { defaultValue: '页面加载失败' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-12px'>
        {t('settings.enterpriseConsole.routeErrorDesc', {
          defaultValue: '企业控制台模块渲染时出错。可尝试刷新本页，或返回加入企业页。',
        })}
      </Typography.Paragraph>
      <Typography.Paragraph className='text-12px text-t-tertiary mb-16px break-all'>
        {error.message}
      </Typography.Paragraph>
      <div className='flex gap-8px flex-wrap'>
        <Button type='primary' onClick={reset}>
          {t('common.retry', { defaultValue: '重试' })}
        </Button>
        <Button onClick={() => void navigate('/enterprise/join')}>
          {t('settings.enterpriseConsole.goJoinEnterprise', { defaultValue: '前往加入企业' })}
        </Button>
      </div>
    </Card>
  );
};

export default EnterpriseRouteErrorFallback;
