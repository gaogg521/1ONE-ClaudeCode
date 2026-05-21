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
import { isElectronDesktop } from '@/renderer/utils/platform';
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
  const isDesktop = isElectronDesktop();

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

  const openAdminConsole = useCallback(async () => {
    if (isDesktop) {
      const result = await openEnterpriseAdminInBrowser();
      if (result === 'webui_not_running') {
        void navigate('/settings/webui');
      }
      return;
    }
    void navigate('/enterprise');
  }, [isDesktop, navigate, openEnterpriseAdminInBrowser]);

  const { title, body, type } = useMemo(() => {
    if (managementMode === 'standalone' && hasJoinedEnterprise) {
      return {
        type: 'info' as const,
        title: t('settings.edition.guideJoinedPersonalTitle', {
          defaultValue: '已加入企业，当前为个人版视图',
          tenant: tenantLabel,
        }),
        body: t('settings.edition.guideJoinedPersonalBody', {
          defaultValue:
            '您已是企业成员（{{tenant}}），但标题栏仍为「个人版」，侧栏不会显示「团队」。切换到「企业版」后以公司身份使用，并启用团队协作。',
          tenant: tenantLabel,
        }),
      };
    }
    if (managementMode === 'standalone') {
      return {
        type: 'info' as const,
        title: t('settings.edition.guidePersonalTitle', { defaultValue: '当前：个人版工作区' }),
        body: t('settings.edition.guidePersonalBody', {
          defaultValue:
            '这里和「企业版」使用同一套会话、任务、工作区界面，差别在于账号与数据范围：个人版面向本机/自己的使用场景。若公司开通了企业版，可在标题栏切换到「企业版」并用邀请码或 LDAP/飞书 登录加入。',
        }),
      };
    }
    if (!hasJoinedEnterprise) {
      return {
        type: 'warning' as const,
        title: t('settings.edition.guideEnterprisePendingTitle', { defaultValue: '企业版：尚未加入组织' }),
        body: t('settings.edition.guideEnterprisePendingBody', {
          defaultValue:
            '切换「企业版」不会打开管理后台。请先在浏览器登录（LDAP/飞书/本地账户等），或在「加入企业」页输入邀请码；加入后才会回到此工作区并以企业身份使用。',
        }),
      };
    }
    if (isAdmin) {
      return {
        type: 'info' as const,
        title: t('settings.edition.guideEnterpriseAdminTitle', {
          defaultValue: '当前：企业版工作区（{{tenant}}）',
          tenant: tenantLabel,
        }),
        body: t('settings.edition.guideEnterpriseAdminBody', {
          defaultValue:
            '日常聊天、任务与个人版相同，只是以企业身份运行。配置成员、LDAP、飞书、邀请码、邮件等请点左侧「管理后台」或标题栏「管理后台」—— 那不是「企业版」切换，而是组织治理专用入口。',
        }),
      };
    }
    return {
      type: 'info' as const,
      title: t('settings.edition.guideEnterpriseMemberTitle', {
        defaultValue: '当前：企业版工作区（{{tenant}}）',
        tenant: tenantLabel,
      }),
      body: t('settings.edition.guideEnterpriseMemberBody', {
        defaultValue:
          '界面与个人版相同，会话与任务在企业租户下进行。您无需进入管理后台；若看到「管理后台」菜单，说明您同时是组织管理员，仅在做管理时才需要打开。',
      }),
    };
  }, [hasJoinedEnterprise, isAdmin, managementMode, t, tenantLabel]);

  if (loading || !visible || !isWorkspaceRoute(location.pathname)) {
    return null;
  }

  return (
    <Alert
      className={styles.guide}
      type={type}
      closable
      onClose={dismiss}
      title={title}
      content={
        <div className={styles.guideBody}>
          <p className={styles.guideText}>{body}</p>
          <div className={styles.guideActions}>
            {managementMode === 'standalone' && hasJoinedEnterprise ? (
              <Button size='mini' type='primary' onClick={switchToEnterpriseEdition}>
                {t('settings.edition.guideSwitchEnterprise', { defaultValue: '切换到企业版' })}
              </Button>
            ) : null}
            {managementMode === 'enterprise' && !hasJoinedEnterprise ? (
              <Button size='mini' type='primary' onClick={() => void navigate('/enterprise/join')}>
                {t('settings.edition.guideGoJoin', { defaultValue: '前往加入企业' })}
              </Button>
            ) : null}
            {managementMode === 'enterprise' && hasJoinedEnterprise && showEnterpriseAdminNav ? (
              <Button size='mini' type='outline' onClick={() => void openAdminConsole()}>
                {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
              </Button>
            ) : null}
            <Button size='mini' type='text' onClick={dismiss}>
              {t('settings.edition.guideDismiss', { defaultValue: '知道了，不再提示' })}
            </Button>
          </div>
        </div>
      }
    />
  );
};

export default EditionWorkspaceGuide;
