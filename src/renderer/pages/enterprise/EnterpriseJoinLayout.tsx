/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { ENTERPRISE_WORKSPACE_PATH } from '@/common/auth/enterpriseRoles';
import Titlebar from '@/renderer/components/layout/Titlebar';
import EditionModeSwitcher from '@/renderer/components/layout/EditionModeSwitcher';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import EnterpriseOnboarding from '@/renderer/pages/enterprise/EnterpriseOnboarding';

/** 企业版入口（未加入）：登录 + 邀请码，不是管理后台。 */
const EnterpriseJoinLayout: React.FC = () => {
  const { loading, hasJoinedEnterprise, refreshEnterpriseContext } = useWebuiEnterpriseMode();

  useEffect(() => {
    void refreshEnterpriseContext();
  }, [refreshEnterpriseContext]);

  if (!loading && hasJoinedEnterprise) {
    return <Navigate to={ENTERPRISE_WORKSPACE_PATH} replace />;
  }

  return (
  <div className='app-shell flex flex-col size-full min-h-0 bg-1'>
    <Titlebar workspaceAvailable={false} />
    <div className='px-16px pt-8px'>
      <EditionModeSwitcher variant='bar' />
    </div>
    <div className='flex-1 overflow-y-auto'>
      <EnterpriseOnboarding />
    </div>
  </div>
  );
};

export default EnterpriseJoinLayout;
