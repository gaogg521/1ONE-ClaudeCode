/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Avatar, Divider, Dropdown, Menu, Message, Tag, Typography } from '@arco-design/web-react';
import { Logout, Peoples } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import type { WorkspaceUserProfile } from '@/common/types/workspaceProfile';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useWorkspaceUserProfile } from '@/renderer/hooks/enterprise/useWorkspaceUserProfile';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';
import styles from './WorkspaceIdentityPanel.module.css';

type WorkspaceIdentityPanelProps = {
  compact?: boolean;
};

function resolveRoleLabel(role: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (role === 'org_admin' || role === 'system_admin' || role === 'admin') {
    return t('settings.workspaceIdentity.roleAdmin', { defaultValue: '管理员' });
  }
  return t('settings.workspaceIdentity.roleMember', { defaultValue: '成员' });
}

const ProfileMenu: React.FC<{
  profile: WorkspaceUserProfile;
  onPickAvatar: () => void;
  onLogout: () => void;
  onSwitchPersonal: () => void;
  onSwitchEnterprise: () => void;
  onOpenAdmin: () => void;
  showAdmin: boolean;
  isDesktop: boolean;
  canUploadAvatar: boolean;
}> = ({
  profile,
  onPickAvatar,
  onLogout,
  onSwitchPersonal,
  onSwitchEnterprise,
  onOpenAdmin,
  showAdmin,
  isDesktop,
  canUploadAvatar,
}) => {
  const { t } = useTranslation();

  return (
    <Menu className={styles.menu}>
      <div className={styles.menuHeader}>
        <Typography.Text bold>{profile.username}</Typography.Text>
        <Typography.Paragraph type='secondary' className={styles.menuSub}>
          {profile.joinedEnterprise
            ? profile.tenantName ?? profile.tenantId
            : t('settings.edition.personal', { defaultValue: '个人版' })}
        </Typography.Paragraph>
        <Tag size='small'>{resolveRoleLabel(profile.role, t)}</Tag>
      </div>
      {profile.teams.length > 0 ? (
        <>
          <Divider margin='8px' />
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
      <Divider margin='8px' />
      {canUploadAvatar ? (
        <Menu.Item key='avatar' onClick={onPickAvatar}>
          {t('settings.workspaceIdentity.changeAvatar', { defaultValue: '更换头像' })}
        </Menu.Item>
      ) : null}
      {profile.joinedEnterprise ? (
        <Menu.Item key='personal' onClick={onSwitchPersonal}>
          {t('settings.workspaceIdentity.switchPersonal', { defaultValue: '切换到个人版' })}
        </Menu.Item>
      ) : (
        <Menu.Item key='enterprise' onClick={onSwitchEnterprise}>
          {t('settings.workspaceIdentity.switchEnterprise', { defaultValue: '加入 / 切换企业' })}
        </Menu.Item>
      )}
      {showAdmin ? (
        <Menu.Item key='admin' onClick={onOpenAdmin}>
          {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
        </Menu.Item>
      ) : null}
      {!isDesktop ? (
        <Menu.Item key='logout' onClick={onLogout}>
          <span className={styles.logoutItem}>
            <Logout theme='outline' size={14} />
            {t('settings.workspaceIdentity.logout', { defaultValue: '退出登录' })}
          </span>
        </Menu.Item>
      ) : null}
    </Menu>
  );
};

const WorkspaceIdentityPanel: React.FC<WorkspaceIdentityPanelProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const auth = useAuth();
  const enterpriseMode = useWebuiEnterpriseMode();
  const { profile, uploadAvatar, visible, avatarDisplayUrl, canUploadAvatar } = useWorkspaceUserProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDesktop = isElectronDesktop();

  const showAdmin = isEnterpriseAdminRole(
    enterpriseMode.effectiveRole ?? auth.user?.role
  ) && enterpriseMode.showEnterpriseAdminNav;

  const avatarSrc = avatarDisplayUrl ?? undefined;

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

  const handleLogout = async () => {
    await auth.logout();
    void navigate('/login');
  };

  const handleSwitchPersonal = () => {
    void enterpriseMode.setManagementMode('standalone').then(() => {
      void navigate('/sessions');
    });
  };

  const handleSwitchEnterprise = () => {
    void navigate('/enterprise/join');
  };

  const handleOpenAdmin = async () => {
    const result = await enterpriseMode.openEnterpriseAdminInBrowser();
    if (result === 'webui_not_running') {
      void navigate('/settings/webui');
    }
  };

  const droplist = (
    <ProfileMenu
      profile={profile}
      onPickAvatar={handleAvatarPick}
      onLogout={() => void handleLogout()}
      onSwitchPersonal={handleSwitchPersonal}
      onSwitchEnterprise={handleSwitchEnterprise}
      onOpenAdmin={() => void handleOpenAdmin()}
      showAdmin={showAdmin}
      isDesktop={isDesktop}
      canUploadAvatar={canUploadAvatar}
    />
  );

  const orgLine = profile.joinedEnterprise
    ? profile.tenantName ?? profile.tenantId
    : t('settings.edition.personal', { defaultValue: '个人版' });

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
          className={classNames(styles.trigger, compact && styles.triggerCompact, layout?.isMobile && styles.triggerMobile)}
          aria-label={t('settings.workspaceIdentity.openMenu', { defaultValue: '账户与组织' })}
        >
          <Avatar size={compact ? 24 : 28} className={styles.avatar}>
            {avatarSrc ? <img src={avatarSrc} alt='' /> : profile.username.slice(0, 1).toUpperCase()}
          </Avatar>
          {!compact ? (
            <span className={styles.meta}>
              <span className={styles.name}>{profile.username}</span>
              <span className={styles.org}>{orgLine}</span>
            </span>
          ) : null}
        </button>
      </Dropdown>
    </>
  );
};

export default WorkspaceIdentityPanel;
