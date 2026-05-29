/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Button, Card, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  buildCacheBustedWebuiUrl,
  resetWebuiClientCaches,
} from '@/renderer/services/webuiCacheReset';

type PersonalRouteErrorBoundaryProps = {
  children: React.ReactNode;
};

type PersonalRouteErrorBoundaryState = {
  error: Error | null;
};

const PersonalRouteErrorFallback: React.FC<{
  error: Error;
  reset: () => void;
}> = ({ error, reset }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clearing, setClearing] = useState(false);
  const isStaleAssetError =
    /Unable to preload CSS/i.test(error.message) || /Failed to fetch dynamically imported module/i.test(error.message);

  const handleHardRefresh = useCallback(async () => {
    setClearing(true);
    try {
      await resetWebuiClientCaches();
    } finally {
      setClearing(false);
      window.location.replace(buildCacheBustedWebuiUrl(window.location.href));
    }
  }, []);

  return (
    <Card bordered={false} className='max-w-640px m-24px'>
      <Typography.Title heading={5} className='mt-0 mb-8px'>
        {t('settings.enterpriseConsole.routeErrorTitle', { defaultValue: '页面加载失败' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-12px'>
        {isStaleAssetError
          ? t('settings.workspace.staleAssetErrorDesc', {
              defaultValue:
                '浏览器可能缓存了旧版本的前端资源（常见于 WebUI 重新编译后）。请使用「清除缓存并刷新」，或对该站点执行 Ctrl+F5。',
            })
          : t('settings.workspace.routeErrorDesc', {
              defaultValue: '工作区页面渲染时出错。可尝试重试或返回首页。',
            })}
      </Typography.Paragraph>
      <Typography.Paragraph className='text-12px text-t-tertiary mb-16px break-all'>
        {error.message}
      </Typography.Paragraph>
      <div className='flex gap-8px flex-wrap'>
        {isStaleAssetError ? (
          <Button type='primary' loading={clearing} onClick={() => void handleHardRefresh()}>
            {t('settings.workspace.clearCacheReload', { defaultValue: '清除缓存并刷新' })}
          </Button>
        ) : (
          <Button type='primary' onClick={reset}>
            {t('common.retry', { defaultValue: '重试' })}
          </Button>
        )}
        <Button onClick={() => void navigate('/guid')}>
          {t('settings.workspace.routeErrorHome', { defaultValue: '返回首页' })}
        </Button>
      </div>
    </Card>
  );
};

export default class PersonalRouteErrorBoundary extends React.Component<
  PersonalRouteErrorBoundaryProps,
  PersonalRouteErrorBoundaryState
> {
  state: PersonalRouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PersonalRouteErrorBoundaryState {
    return { error };
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      return <PersonalRouteErrorFallback error={error} reset={this.handleReset} />;
    }
    return this.props.children;
  }
}
