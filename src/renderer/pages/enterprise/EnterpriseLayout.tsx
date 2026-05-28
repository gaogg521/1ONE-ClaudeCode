/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Titlebar from '@/renderer/components/layout/Titlebar';
import EditionModeSwitcher from '@/renderer/components/layout/EditionModeSwitcher';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import {
  EnterpriseRuntimeProvider,
  useEnterpriseRuntime,
} from '@/renderer/hooks/enterprise/useEnterpriseRuntime';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { ENTERPRISE_JOIN_PATH } from '@/renderer/pages/enterprise/paths';
import { EnterpriseGateProvider } from '@/renderer/pages/settings/enterpriseGateContext';
import { getEnterpriseNavItemByPath } from '@/renderer/pages/enterprise/enterpriseNav';
import EnterpriseNavSidebar from '@/renderer/pages/enterprise/components/EnterpriseNavSidebar';
import '@/renderer/styles/enterprise-theme.css';
import styles from '@/renderer/pages/enterprise/EnterpriseLayout.module.css';

const EnterpriseLayoutContent: React.FC = () => {
  const { t } = useTranslation();
  const { status: authStatus } = useAuth();
  const navigate = useNavigate();
  const { enterpriseContext } = useWebuiEnterpriseMode();
  const runtime = useEnterpriseRuntime();
  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';

  const handleNavClick = useCallback(
    (path: string) => {
      if (runtime.activeNavItem.path === path) {
        return;
      }
      const matched =
        runtime.visibleNavItems.find((item) => item.path === path) ??
        getEnterpriseNavItemByPath(path);
      if (!matched) {
        void navigate(path);
        return;
      }
      void navigate(path);
    },
    [navigate, runtime]
  );

  const gateStatus = runtime.loading ? 'loading' : 'ready';

  const renderGuard = (): React.ReactNode => {
    if (runtime.status === 'ready') {
      return <Outlet />;
    }
    return (
      <Card className={styles.guardCard} bordered={false}>
        <Space direction='vertical' size={16} className='w-full'>
          <Typography.Title heading={5} className='mb-0'>
            {runtime.activeNavItem.labelDefault}
          </Typography.Title>
          <Typography.Paragraph type='secondary' className='mb-0'>
            {runtime.issue?.message}
          </Typography.Paragraph>
          {runtime.status === 'not_joined' ? (
            <Button type='primary' onClick={() => void navigate(ENTERPRISE_JOIN_PATH)}>
              {t('settings.enterpriseConsole.goJoinEnterprise', { defaultValue: '前往加入企业' })}
            </Button>
          ) : null}
        </Space>
      </Card>
    );
  };

  // 所有企业成员均可进入控制台，后端 API 按 scope 过滤数据权限
  return (
    <div className='app-shell flex flex-col size-full min-h-0 bg-1' data-enterprise-theme='true'>
      <Titlebar workspaceAvailable={false} />
      {authStatus !== 'authenticated' ? (
        <div className='px-16px pt-8px shrink-0'>
          <EditionModeSwitcher variant='bar' />
        </div>
      ) : null}
      <div className='flex flex-1 min-h-0'>
        <EnterpriseNavSidebar
          tenantLabel={tenantLabel}
          activeNavKey={runtime.activeNavItem.key}
          items={runtime.visibleNavItems}
          onNavigate={handleNavClick}
        />
        <main className={styles.main}>
          <div className={styles.headerRow}>
            <Typography.Text type='secondary'>
              {tenantLabel
                ? t('settings.enterpriseConsole.workspaceForTenant', {
                    defaultValue: '{{tenant}} 企业控制台',
                    tenant: tenantLabel,
                  })
                : t('settings.enterpriseConsole.title', { defaultValue: '企业控制台' })}
            </Typography.Text>
            <div className='flex flex-wrap gap-8px'>
              <Button size='small' onClick={() => void navigate('/sessions')}>
                {t('settings.enterpriseConsole.backToPersonal', { defaultValue: '返回个人工作台' })}
              </Button>
            </div>
          </div>
          {runtime.status === 'webui_unavailable' ? (
            <Alert
              type='error'
              className='mb-16px'
              content={t('settings.enterpriseConsole.webuiUnavailable', {
                defaultValue: '本地 WebUI 未启动，企业控制台暂时不可用。',
              })}
            />
          ) : null}
          <EnterpriseGateProvider
            value={{
              status: gateStatus,
              refetch: runtime.refresh,
            }}
          >
            {renderGuard()}
          </EnterpriseGateProvider>
        </main>
      </div>
    </div>
  );
};

const EnterpriseLayout: React.FC = () => {
  const location = useLocation();
  const { loading: enterpriseModeLoading, hasJoinedEnterprise } = useWebuiEnterpriseMode();

  if (enterpriseModeLoading) {
    return (
      <div className='app-shell flex flex-col size-full min-h-0' data-enterprise-theme='true'>
        <Titlebar workspaceAvailable={false} />
        <div className='flex justify-center items-center flex-1 py-40px'>
          <Spin />
        </div>
      </div>
    );
  }

  if (!hasJoinedEnterprise) {
    return <Navigate to={ENTERPRISE_JOIN_PATH} replace />;
  }

  return (
    <EnterpriseRuntimeProvider pathname={location.pathname}>
      <EnterpriseLayoutContent />
    </EnterpriseRuntimeProvider>
  );
};

export default EnterpriseLayout;
