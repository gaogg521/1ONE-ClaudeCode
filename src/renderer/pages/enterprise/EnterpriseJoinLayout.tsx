/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { ENTERPRISE_WORKSPACE_PATH } from '@/common/auth/enterpriseRoles';
import AppLoader from '@/renderer/components/layout/AppLoader';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import EnterpriseOnboarding from '@/renderer/pages/enterprise/EnterpriseOnboarding';

/** 企业版入口（未加入）：在 PersonalShell 内展示，保留侧栏与新建会话。 */
const EnterpriseJoinLayout: React.FC = () => {
  const { loading, hasJoinedEnterprise, refreshEnterpriseContext } = useWebuiEnterpriseMode();

  useEffect(() => {
    void refreshEnterpriseContext();
  }, [refreshEnterpriseContext]);

  if (loading) {
    return <AppLoader />;
  }

  if (hasJoinedEnterprise) {
    return <Navigate to={ENTERPRISE_WORKSPACE_PATH} replace />;
  }

  return <EnterpriseOnboarding />;
};

export default EnterpriseJoinLayout;
