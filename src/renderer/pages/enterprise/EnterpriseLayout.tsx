/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Button, Spin, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import Titlebar from '@/renderer/components/layout/Titlebar';
import EditionModeSwitcher from '@/renderer/components/layout/EditionModeSwitcher';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { ENTERPRISE_HOME_PATH, ENTERPRISE_JOIN_PATH, ENTERPRISE_WORKSPACE_PATH } from '@/renderer/pages/enterprise/paths';
import { enterpriseNavKeyFromPath } from '@/renderer/pages/enterprise/enterpriseNav';
import { formatEnterpriseRole } from '@/renderer/pages/enterprise/enterpriseElevationUi';
import EnterpriseNavSidebar from '@/renderer/pages/enterprise/components/EnterpriseNavSidebar';
import '@/renderer/styles/enterprise-theme.css';
import styles from '@/renderer/pages/enterprise/EnterpriseLayout.module.css';

const EnterpriseLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    loading: enterpriseModeLoading,
    hasJoinedEnterprise,
    enterpriseContext,
    effectiveRole,
  } = useWebuiEnterpriseMode();

  const isOrgAdmin = isEnterpriseAdminRole(effectiveRole ?? user?.role);
  const activeNavKey = enterpriseNavKeyFromPath(location.pathname);
  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';

  const handleNavClick = useCallback((path: string) => { void navigate(path); }, [navigate]);

  if (enterpriseModeLoading) {
    return (
      <div className='app-shell flex flex-col size-full min-h-0' data-enterprise-theme='true'>
        <Titlebar workspaceAvailable={false} />
        <div className='flex justify-center items-center flex-1 py-40px'><Spin /></div>
      </div>
    );
  }

  if (!hasJoinedEnterprise) {
    return <Navigate to={ENTERPRISE_JOIN_PATH} replace />;
  }

  // 所有企业成员均可进入控制台，后端 API 按 scope 过滤数据权限
  return (
    <div className='app-shell flex flex-col size-full min-h-0 bg-1' data-enterprise-theme='true'>
      <Titlebar workspaceAvailable={false} />
      <div className='px-16px pt-8px shrink-0'>
        <EditionModeSwitcher variant='bar' />
      </div>
      <div className='flex flex-1 min-h-0'>
        <EnterpriseNavSidebar
          tenantLabel={tenantLabel}
          activeNavKey={activeNavKey}
          onNavigate={handleNavClick}
        />
        <main className={styles.main}>
          <div className={styles.headerRow}>
            <div className='flex flex-wrap items-center gap-8px'>
              <Tag color='arcoblue'>{formatEnterpriseRole(user?.role, t)}</Tag>
              {user?.username ? <Tag>{user.username}</Tag> : null}
            </div>
            <div className='flex flex-wrap gap-8px'>
              <Button size='small' onClick={() => void navigate('/sessions')}>
                {t('settings.enterpriseConsole.backToPersonal', { defaultValue: '返回个人工作台' })}
              </Button>
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default EnterpriseLayout;
