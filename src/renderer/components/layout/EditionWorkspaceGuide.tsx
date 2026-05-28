/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { openAdminConsole } from '@/renderer/utils/openAdminConsole';
import styles from '@/renderer/components/layout/EditionWorkspaceGuide.module.css';

const WORKSPACE_ROUTE_PREFIXES = ['/sessions', '/workspace', '/tasks', '/conversation', '/guid'];

function isWorkspaceRoute(pathname: string): boolean {
  return WORKSPACE_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function dismissKey(mode: string, joinedWhilePersonal: boolean): string {
  if (joinedWhilePersonal) {
    return 'one-edition-workspace-guide-dismissed-joined-personal';
  }
  return `one-edition-workspace-guide-dismissed-${mode}`;
}

const EditionWorkspaceGuide: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    loading,
    managementMode,
    hasJoinedEnterprise,
    enterpriseContext,
    showEnterpriseAdminNav,
    effectiveRole,
    setManagementMode,
    openEnterpriseAdminInBrowser,
  } = useWebuiEnterpriseMode();

  const joinedWhilePersonal = managementMode === 'standalone' && hasJoinedEnterprise;
  const storageKey = dismissKey(managementMode, joinedWhilePersonal);
  const [visible, setVisible] = useState(
    () => typeof sessionStorage === 'undefined' || sessionStorage.getItem(storageKey) !== '1'
  );

  const dismiss = useCallback(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(storageKey, '1');
    }
    setVisible(false);
  }, [storageKey]);

  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';
  const isAdmin = isEnterpriseAdminRole(effectiveRole ?? user?.role);

  const switchToEnterpriseEdition = useCallback(() => {
    void setManagementMode('enterprise').then(() => {
      void navigate('/sessions');
    });
  }, [navigate, setManagementMode]);

  const openAdminConsoleHandler = useCallback(async () => {
    await openAdminConsole({
      navigate: (path) => {
        void navigate(path);
      },
      openEnterpriseAdminInBrowser,
    });
  }, [navigate, openEnterpriseAdminInBrowser]);

  const { line, type, action } = useMemo(() => {
    if (managementMode === 'standalone' && hasJoinedEnterprise) {
      return {
        type: 'info' as const,
        line: t('settings.edition.guideJoinedPersonalLine', {
          defaultValue: '已加入 {{tenant}}，当前为个人版视图。',
          tenant: tenantLabel,
        }),
        action: (
          <Button size='mini' type='text' onClick={switchToEnterpriseEdition}>
            {t('settings.edition.guideSwitchEnterprise', { defaultValue: '切换到1ONE Code 企业版' })}
          </Button>
        ),
      };
    }
    if (managementMode === 'standalone') {
      return {
        type: 'info' as const,
        line: t('settings.edition.guidePersonalLine', { defaultValue: '当前为个人版工作区。' }),
        action: null,
      };
    }
    if (!hasJoinedEnterprise) {
      return {
        type: 'warning' as const,
        line: t('settings.edition.guideEnterprisePendingLine', {
          defaultValue: '尚未加入组织，请先登录或输入邀请码加入。',
        }),
        action: (
          <Button size='mini' type='text' onClick={() => void navigate('/enterprise/join')}>
            {t('settings.edition.guideGoJoin', { defaultValue: '前往加入企业' })}
          </Button>
        ),
      };
    }
    if (isAdmin) {
      return {
        type: 'info' as const,
        line: t('settings.edition.guideEnterpriseAdminLine', {
          defaultValue: '企业版工作区（{{tenant}}）。',
          tenant: tenantLabel,
        }),
        action: showEnterpriseAdminNav ? (
          <Button size='mini' type='text' onClick={() => void openAdminConsoleHandler()}>
            {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
          </Button>
        ) : null,
      };
    }
    return {
      type: 'info' as const,
      line: t('settings.edition.guideEnterpriseMemberLine', {
        defaultValue: '企业版工作区（{{tenant}}）。',
        tenant: tenantLabel,
      }),
      action: null,
    };
  }, [
    hasJoinedEnterprise,
    isAdmin,
    managementMode,
    openAdminConsoleHandler,
    showEnterpriseAdminNav,
    switchToEnterpriseEdition,
    t,
    tenantLabel,
    navigate,
  ]);

  if (loading || !visible || !isWorkspaceRoute(location.pathname)) {
    return null;
  }

  return (
    <Alert
      className={styles.guide}
      type={type}
      closable
      onClose={dismiss}
      content={
        <div className={styles.guideRow}>
          <span className={styles.guideText}>{line}</span>
          {action}
        </div>
      }
    />
  );
};

export default EditionWorkspaceGuide;
