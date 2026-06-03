/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef } from 'react';
import { Avatar, Divider, Dropdown, Menu, Message, Tag, Typography } from '@arco-design/web-react';
import { Logout, Peoples } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import type { WorkspaceUserProfile } from '@/common/types/workspaceProfile';
import { ANONYMOUS_WORKSPACE_USER_ID } from '@/common/types/workspaceProfile';
import { isDesktopOperatorUser, useAuth } from '@/renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useWorkspaceUserProfile } from '@/renderer/hooks/enterprise/useWorkspaceUserProfile';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { openAdminConsole } from '@/renderer/utils/openAdminConsole';
import { buildWebuiAdminLoginPath } from '@/renderer/utils/enterpriseLoginNavigation';
import { appNavigate } from '@/renderer/utils/appNavigate';
import { navigateAfterEditionSwitch } from '@/renderer/utils/editionSwitchNavigation';
import styles from './WorkspaceIdentityPanel.module.css';

type WorkspaceIdentityPanelProps = {
  compact?: boolean;
  surface?: 'pill' | 'card';
};

function resolveRoleLabel(role: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (role === 'system_admin') {
    return t('settings.users.roleSystemAdmin', { defaultValue: '系统管理员' });
  }
  if (role === 'org_admin' || role === 'admin') {
    return t('settings.users.roleOrgAdmin', { defaultValue: '组织管理员' });
  }
  return t('settings.workspaceIdentity.roleMember', { defaultValue: '成员' });
}

function buildOrgLine(
  profile: WorkspaceUserProfile,
  managementMode: WebuiManagementMode,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (!profile.joinedEnterprise) {
    return t('settings.edition.personal', { defaultValue: '个人版' });
  }
  const tenant = profile.tenantName ?? profile.tenantId;
  const editionLabel =
    managementMode === 'enterprise'
      ? t('settings.workspaceIdentity.editionEnterprise', { defaultValue: '1ONE Code 企业版' })
      : t('settings.workspaceIdentity.personalView', { defaultValue: '个人版视图' });
  return `${tenant} · ${editionLabel}`;
}

const GuestProfileMenu: React.FC<{
  onJoinEnterprise: () => void;
  onEnterpriseLogin: () => void;
  onAdminLogin: () => void;
  enterpriseConnected?: boolean;
  tenantLabel?: string | null;
}> = ({ onJoinEnterprise, onEnterpriseLogin, onAdminLogin, enterpriseConnected = false, tenantLabel = null }) => {
  const { t } = useTranslation();

  const handleMenuItem = (key: string) => {
    if (key === 'enterprise-login') {
      onEnterpriseLogin();
      return;
    }
    if (key === 'join') {
      onJoinEnterprise();
      return;
    }
    if (key === 'admin-login') {
      onAdminLogin();
    }
  };

  return (
    <Menu className={styles.menu} onClickMenuItem={handleMenuItem}>
      <div className={styles.menuHeader}>
        <Typography.Text bold>
          {enterpriseConnected
            ? t('settings.workspaceIdentity.enterprisePendingLoginTitle', {
                defaultValue: '请登录企业账号',
              })
            : t('settings.workspaceIdentity.guestTitle', { defaultValue: '访客模式' })}
        </Typography.Text>
        <Typography.Paragraph type='secondary' className={styles.menuSub}>
          {enterpriseConnected
            ? t('settings.workspaceIdentity.enterprisePendingLoginDesc', {
                defaultValue:
                  '当前实例已接入 {{tenant}}。登录企业账号后，将显示你的姓名、角色、组织架构与所属团队。',
                tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '企业组织' }),
              })
            : t('settings.workspaceIdentity.guestDesc', {
                defaultValue: '当前为单机个人版，可直接使用会话与工作区。加入团队后可使用企业协作能力。',
              })}
        </Typography.Paragraph>
      </div>
      <Divider style={{ margin: '8px 0' }} />
      {enterpriseConnected ? (
        <Menu.Item key='enterprise-login'>
          {t('settings.edition.enterpriseLoginAction', { defaultValue: '登录企业账号' })}
        </Menu.Item>
      ) : (
        <Menu.Item key='join'>
          {t('settings.workspaceIdentity.guestJoinEnterprise', { defaultValue: '登录 / 加入团队' })}
        </Menu.Item>
      )}
      <Menu.Item key='admin-login'>
        {t('settings.workspaceIdentity.guestAdminLogin', { defaultValue: 'WebUI 管理员登录' })}
      </Menu.Item>
    </Menu>
  );
};

const ProfileMenu: React.FC<{
  profile: WorkspaceUserProfile;
  managementMode: WebuiManagementMode;
  onPickAvatar: () => void;
  onLogout: () => void;
  onSwitchPersonal: () => void;
  onSwitchEnterprise: () => void;
  onOpenAdmin: () => void;
  showAdmin: boolean;
  canUploadAvatar: boolean;
  displayRole?: string;
}> = ({
  profile,
  managementMode,
  onPickAvatar,
  onLogout,
  onSwitchPersonal,
  onSwitchEnterprise,
  onOpenAdmin,
  showAdmin,
  canUploadAvatar,
  displayRole,
}) => {
  const { t } = useTranslation();
  const isEnterpriseView = managementMode === 'enterprise';

  const handleMenuItem = (key: string) => {
    if (key === 'avatar') {
      onPickAvatar();
      return;
    }
    if (key === 'personal') {
      onSwitchPersonal();
      return;
    }
    if (key === 'enterprise' || key === 'join') {
      onSwitchEnterprise();
      return;
    }
    if (key === 'admin') {
      void onOpenAdmin();
      return;
    }
    if (key === 'logout') {
      onLogout();
    }
  };

  return (
    <Menu className={styles.menu} onClickMenuItem={handleMenuItem}>
      <div className={styles.menuHeader}>
        <Typography.Text bold>{profile.username}</Typography.Text>
        {profile.email ? (
          <Typography.Paragraph type='secondary' className={styles.menuSub}>
            {profile.email}
          </Typography.Paragraph>
        ) : null}
        <Typography.Paragraph type='secondary' className={styles.menuSub}>
          {buildOrgLine(profile, managementMode, t)}
        </Typography.Paragraph>
        <Tag size='small'>{resolveRoleLabel(displayRole ?? profile.role, t)}</Tag>
      </div>
      {profile.orgUnitPath ? (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div className={styles.teamBlock}>
            <div className={styles.teamTitle}>
              {t('settings.workspaceIdentity.orgUnit', { defaultValue: '组织架构' })}
            </div>
            <Typography.Paragraph className={styles.orgUnitText}>{profile.orgUnitPath}</Typography.Paragraph>
          </div>
        </>
      ) : null}
      {profile.teams.length > 0 ? (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div className={styles.teamBlock}>
            <div className={styles.teamTitle}>
              <Peoples theme='outline' size={14} />
              {t('settings.workspaceIdentity.teams', { defaultValue: '所属团队' })}
            </div>
            {profile.teams.map((team) => (
              <div key={team.teamId} className={styles.teamRow}>
                <span>{team.teamName}</span>
                <Tag size='small'>{team.role}</Tag>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <Divider style={{ margin: '8px 0' }} />
      {canUploadAvatar ? (
        <Menu.Item key='avatar'>
          {t('settings.workspaceIdentity.changeAvatar', { defaultValue: '更换头像' })}
        </Menu.Item>
      ) : null}
      {profile.joinedEnterprise ? (
        isEnterpriseView ? (
          <Menu.Item key='personal'>
            {t('settings.workspaceIdentity.switchPersonal', { defaultValue: '切换到个人版' })}
          </Menu.Item>
        ) : (
          <Menu.Item key='enterprise'>
            {t('settings.workspaceIdentity.switchEnterpriseEdition', { defaultValue: '切换到1ONE Code 企业版' })}
          </Menu.Item>
        )
      ) : (
        <Menu.Item key='join'>
          {t('settings.workspaceIdentity.switchEnterprise', { defaultValue: '加入 / 切换企业' })}
        </Menu.Item>
      )}
      {showAdmin ? (
        <Menu.Item key='admin'>
          {t('settings.edition.enterpriseAdminConsole', { defaultValue: '企业团队版管理后台' })}
        </Menu.Item>
      ) : null}
      <Menu.Item key='logout'>
        <span className={styles.logoutItem}>
          <Logout theme='outline' size={14} />
          {t('settings.workspaceIdentity.logout', { defaultValue: '退出登录' })}
        </span>
      </Menu.Item>
    </Menu>
  );
};

const WorkspaceIdentityPanel: React.FC<WorkspaceIdentityPanelProps> = ({ compact = false, surface = 'pill' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const layout = useLayoutContext();
  const auth = useAuth();
  const enterpriseMode = useWebuiEnterpriseMode();
  const { profile, uploadAvatar, visible, avatarDisplayUrl, canUploadAvatar } = useWorkspaceUserProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDesktop = isElectronDesktop();

  const showAdmin = enterpriseMode.showEnterpriseAdminNav;

  const avatarSrc = avatarDisplayUrl ?? undefined;

  const switchEdition = useCallback(
    (next: WebuiManagementMode) => {
      void enterpriseMode.setManagementMode(next).then(() => {
        navigateAfterEditionSwitch({
          next,
          navigate,
          isDesktop,
          hasJoinedEnterprise: enterpriseMode.hasJoinedEnterprise,
          hasInstanceEnterprise: enterpriseMode.hasInstanceEnterprise,
          isAuthenticated: auth.status === 'authenticated',
          isDesktopOperator: isDesktopOperatorUser(auth.user),
          currentPath: location.pathname,
          onAlreadyAtTarget: () => {
            Message.info(
              t('settings.edition.switchAlreadyHere', {
                defaultValue: next === 'enterprise' ? '已切换到企业团队版视图' : '已切换到个人版视图',
              })
            );
          },
        });
        if (
          next === 'enterprise' &&
          isDesktop &&
          isDesktopOperatorUser(auth.user) &&
          !enterpriseMode.hasJoinedEnterprise &&
          enterpriseMode.hasInstanceEnterprise
        ) {
          Message.info(
            t('settings.edition.desktopOperatorSwitched', {
              defaultValue: '已切换到企业团队版视图。如需以组织成员身份操作，请登录企业账号。',
            })
          );
        }
      });
    },
    [
      auth.status,
      auth.user,
      enterpriseMode,
      isDesktop,
      location.pathname,
      navigate,
      t,
    ]
  );

  if (!visible || !profile) {
    return null;
  }

  const handleAvatarPick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      await uploadAvatar(file);
      Message.success(t('settings.workspaceIdentity.avatarUpdated', { defaultValue: '头像已更新' }));
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('settings.workspaceIdentity.avatarFailed', { defaultValue: '头像更新失败' })
      );
    }
  };

  const isGuest = profile.userId === ANONYMOUS_WORKSPACE_USER_ID;
  const enterpriseGuestTenantLabel =
    enterpriseMode.enterpriseContext?.tenantName ?? enterpriseMode.enterpriseContext?.tenantId ?? null;
  const isEnterpriseGuest =
    isGuest &&
    enterpriseMode.managementMode === 'enterprise' &&
    enterpriseMode.hasInstanceEnterprise &&
    !enterpriseMode.hasJoinedEnterprise &&
    Boolean(enterpriseGuestTenantLabel);

  const handleGuestEnterpriseLogin = () => {
    const returnTo =
      location.pathname.startsWith('/login') || location.pathname.startsWith('/enterprise/join')
        ? '/sessions'
        : `${location.pathname}${location.search}`;
    void enterpriseMode.startEnterpriseLogin((path) => appNavigate(navigate, path), returnTo);
  };

  const handleGuestJoin = () => {
    if (isEnterpriseGuest) {
      handleGuestEnterpriseLogin();
      return;
    }
    void enterpriseMode.setManagementMode('enterprise').then(() => {
      appNavigate(navigate, '/enterprise/join');
    });
  };

  const handleGuestAdminLogin = () => {
    const returnTo =
      location.pathname.startsWith('/login') || location.pathname.startsWith('/enterprise/join')
        ? '/sessions'
        : `${location.pathname}${location.search}`;
    void navigate(buildWebuiAdminLoginPath(returnTo), { state: { returnTo } });
  };

  const handleLogout = async () => {
    if (isGuest) {
      return;
    }
    await auth.logout();
    if (!isDesktop) {
      void navigate('/sessions');
    }
  };

  const handleSwitchPersonal = () => {
    switchEdition('standalone');
  };

  const handleSwitchEnterprise = () => {
    if (profile.joinedEnterprise) {
      switchEdition('enterprise');
      return;
    }
    void enterpriseMode.setManagementMode('enterprise').then(() => {
      navigateAfterEditionSwitch({
        next: 'enterprise',
        navigate,
        isDesktop,
        hasJoinedEnterprise: enterpriseMode.hasJoinedEnterprise,
        hasInstanceEnterprise: enterpriseMode.hasInstanceEnterprise,
        isAuthenticated: auth.status === 'authenticated',
        isDesktopOperator: isDesktopOperatorUser(auth.user),
        currentPath: location.pathname,
      });
    });
  };

  const handleOpenAdmin = async () => {
    const result = await openAdminConsole({
      navigate: (path) => {
        void navigate(path);
      },
      openEnterpriseAdminInBrowser: enterpriseMode.openEnterpriseAdminInBrowser,
    });
    if (result === 'webui_not_running') {
      void navigate('/settings/webui');
    }
  };

  const orgLine = isGuest
    ? isEnterpriseGuest
      ? t('settings.workspaceIdentity.enterprisePendingLoginEdition', {
          defaultValue: '{{tenant}} · 登录后显示姓名与组织架构',
          tenant: enterpriseGuestTenantLabel,
        })
      : t('settings.workspaceIdentity.guestEdition', { defaultValue: '个人版 · 未登录' })
    : buildOrgLine(profile, enterpriseMode.managementMode, t);

  const displayName = isGuest
    ? isEnterpriseGuest
      ? t('settings.workspaceIdentity.enterprisePendingLoginName', {
          defaultValue: '请登录企业账号',
        })
      : t('settings.workspaceIdentity.guestName', { defaultValue: '访客' })
    : profile.username;

  const avatarInitial = isGuest
    ? isEnterpriseGuest
      ? (enterpriseGuestTenantLabel?.slice(0, 1) ?? '企')
      : displayName.slice(0, 1).toUpperCase()
    : displayName.slice(0, 1).toUpperCase();

  const droplist = isGuest ? (
    <GuestProfileMenu
      onJoinEnterprise={handleGuestJoin}
      onEnterpriseLogin={handleGuestEnterpriseLogin}
      onAdminLogin={handleGuestAdminLogin}
      enterpriseConnected={isEnterpriseGuest}
      tenantLabel={enterpriseGuestTenantLabel}
    />
  ) : (
    <ProfileMenu
      profile={profile}
      managementMode={enterpriseMode.managementMode}
      onPickAvatar={handleAvatarPick}
      onLogout={() => void handleLogout()}
      onSwitchPersonal={handleSwitchPersonal}
      onSwitchEnterprise={handleSwitchEnterprise}
      onOpenAdmin={() => void handleOpenAdmin()}
      showAdmin={showAdmin}
      canUploadAvatar={canUploadAvatar}
      displayRole={enterpriseMode.effectiveRole}
    />
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp,image/gif'
        className='sr-only'
        onChange={(event) => void handleAvatarChange(event)}
      />
      <Dropdown droplist={droplist} trigger='click' position='bl'>
        <button
          type='button'
          className={classNames(
            styles.trigger,
            compact && styles.triggerCompact,
            layout?.isMobile && styles.triggerMobile,
            surface === 'card' && styles.triggerCard
          )}
          aria-label={t('settings.workspaceIdentity.openMenu', { defaultValue: '账户与组织' })}
        >
          <Avatar size={compact ? 24 : 28} className={styles.avatar}>
            {avatarSrc ? <img src={avatarSrc} alt='' /> : avatarInitial}
          </Avatar>
          {!compact ? (
            <span className={classNames(styles.meta, surface === 'card' && styles.metaCard)}>
              <span className={classNames(styles.name, surface === 'card' && styles.nameCard)}>{displayName}</span>
              <span className={classNames(styles.org, surface === 'card' && styles.orgCard)}>{orgLine}</span>
              {!isGuest && profile.orgUnitPath ? (
                <span className={classNames(styles.dept, surface === 'card' && styles.deptCard)}>{profile.orgUnitPath}</span>
              ) : null}
            </span>
          ) : null}
        </button>
      </Dropdown>
    </>
  );
};

export default WorkspaceIdentityPanel;
