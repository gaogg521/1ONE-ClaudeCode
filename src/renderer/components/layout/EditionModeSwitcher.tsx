/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Button, Popover, Radio, Tag, Tooltip } from '@arco-design/web-react';
import { Help } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import { resolveEnterpriseEditionPath } from '@/common/auth/enterpriseRoles';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { openAdminConsole as openAdminConsoleRoute } from '@/renderer/utils/openAdminConsole';
import { setPostLoginRedirect } from '@/renderer/utils/postLoginRedirect';
import styles from '@/renderer/components/layout/EditionModeSwitcher.module.css';

type EditionModeSwitcherProps = {
  /** `bar` = full width strip; `compact` = titlebar chip */
  variant?: 'bar' | 'compact';
};

const EditionModeSwitcher: React.FC<EditionModeSwitcherProps> = ({ variant = 'bar' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = isElectronDesktop();
  const { status } = useAuth();
  const {
    loading,
    hasJoinedEnterprise,
    managementMode,
    enterpriseContext,
    setManagementMode,
    openEnterpriseAdminInBrowser,
    openEnterpriseLoginInBrowser,
    showEnterpriseAdminNav,
  } = useWebuiEnterpriseMode();

  /** 版本切换只看 managementMode，与 /enterprise 管理后台路由无关 */
  const activeEdition: WebuiManagementMode = managementMode;

  const switchEdition = useCallback(
    (next: WebuiManagementMode) => {
      void setManagementMode(next).then(async () => {
        if (next === 'enterprise') {
          if (isDesktop && !hasJoinedEnterprise) {
            void navigate('/enterprise/join');
            return;
          }
          if (status !== 'authenticated') {
            void navigate('/enterprise/join');
            return;
          }
          // 切换到企业版，同样瞬间回到日常开发聊天主台
          // Switch to enterprise, also instantly navigate back to normal developer workspace
          void navigate('/sessions');
          return;
        }
        void navigate('/sessions');
      });
    },
    [
      hasJoinedEnterprise,
      isDesktop,
      navigate,
      openEnterpriseLoginInBrowser,
      setManagementMode,
      status,
    ]
  );

  const openAdminConsole = useCallback(async () => {
    const result = await openAdminConsoleRoute({
      navigate: (path) => {
        void navigate(path);
      },
      openEnterpriseAdminInBrowser,
    });
    if (result === 'webui_not_running') {
      void navigate('/settings/webui');
    }
  }, [navigate, openEnterpriseAdminInBrowser]);

  if (loading) {
    return null;
  }

  // 已加入企业：不显示切换器，直接展示企业身份标识 + 管理后台入口
  if (hasJoinedEnterprise) {
    const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId;
    if (variant === 'compact') {
      return (
        <div className={styles.compact}>
          <Tag size='small' color='arcoblue'>{tenantLabel || t('settings.edition.joined', { defaultValue: '已加入企业' })}</Tag>
          {showEnterpriseAdminNav ? (
            <Button size='mini' type='text' onClick={() => void openAdminConsole()}>
              {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <div className={styles.bar}>
        <div className={styles.barTop}>
          <div className={styles.barLeft}>
            <Tag color='arcoblue'>{tenantLabel || t('settings.edition.joined', { defaultValue: '已加入企业' })}</Tag>
          </div>
          {showEnterpriseAdminNav ? (
            <Button size='small' type='outline' onClick={() => void openAdminConsole()}>
              {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId;
  const personalLabel = t('settings.edition.personal', { defaultValue: '个人版' });
  const enterpriseLabel = t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' });
  const helpContent = (
    <div className={styles.helpPopover}>
      <p className={styles.helpTitle}>{t('settings.edition.helpTitle', { defaultValue: '个人版 / 1ONE Code 企业版 / 管理后台 区别' })}</p>
      <p className={styles.helpP}>
        {t('settings.edition.helpPersonal', {
          defaultValue: '个人版：本机/自己的账号与数据，界面即当前会话工作区。',
        })}
      </p>
      <p className={styles.helpP}>
        {t('settings.edition.helpEnterprise', {
          defaultValue:
            '1ONE Code 企业版：同一套工作区，但以企业身份使用（需先加入）。界面不会变成「管理页」。',
        })}
      </p>
      <p className={styles.helpP}>
        {t('settings.edition.helpAdmin', {
          defaultValue: '管理后台：仅管理员在侧栏进入，用于成员、LDAP、邀请码等，与版本切换无关。',
        })}
      </p>
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className={styles.compact}>
        <Radio.Group
          type='button'
          size='mini'
          value={activeEdition}
          onChange={(v) => switchEdition(v as WebuiManagementMode)}
        >
          <Radio value='standalone'>{personalLabel}</Radio>
          <Radio value='enterprise'>{enterpriseLabel}</Radio>
        </Radio.Group>
        {showEnterpriseAdminNav ? (
          <Button size='mini' type='text' onClick={() => void openAdminConsole()}>
            {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
          </Button>
        ) : null}
        <Popover position='bottom' content={helpContent}>
          <button type='button' className={styles.helpBtn} aria-label={t('settings.edition.helpTitle', { defaultValue: '版本说明' })}>
            <Help theme='outline' size={14} fill='currentColor' />
          </button>
        </Popover>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <div className={styles.barTop}>
      <div className={styles.barLeft}>
        <span className={styles.barTitle}>
          {t('settings.edition.switchTitle', { defaultValue: '工作区版本' })}
        </span>
        <Popover position='bottom' content={helpContent}>
          <button type='button' className={styles.helpBtn} aria-label={t('settings.edition.helpTitle', { defaultValue: '版本说明' })}>
            <Help theme='outline' size={14} fill='currentColor' />
          </button>
        </Popover>
        <Radio.Group
          type='button'
          value={activeEdition}
          onChange={(v) => switchEdition(v as WebuiManagementMode)}
        >
          <Radio value='standalone'>
            {personalLabel}
            <span className={styles.radioSub}>
              {t('settings.edition.personalSub', { defaultValue: '个人身份 · 本机会话' })}
            </span>
          </Radio>
          <Radio value='enterprise'>
            {enterpriseLabel}
            <span className={styles.radioSub}>
              {hasJoinedEnterprise
                ? t('settings.edition.enterpriseSubJoined', {
                    defaultValue: '公司身份 · 同一工作区',
                    tenant: tenantLabel ?? '',
                  })
                : t('settings.edition.enterpriseSubInvite', { defaultValue: '需登录或邀请码' })}
            </span>
          </Radio>
        </Radio.Group>
        {!hasJoinedEnterprise ? (
          <Tag size='small' color='orangered'>
            {t('settings.edition.needInvite', { defaultValue: '未加入企业' })}
          </Tag>
        ) : (
          <Tag size='small' color='arcoblue'>
            {tenantLabel || t('settings.edition.joined', { defaultValue: '已加入' })}
          </Tag>
        )}
      </div>
      {showEnterpriseAdminNav ? (
        <Tooltip
          content={t('settings.edition.adminConsoleHint', {
            defaultValue: '组织管理后台（成员、LDAP、邀请码、邮件）与上方「1ONE Code 企业版」工作区是独立入口。',
          })}
        >
          <Button size='small' type='outline' onClick={() => void openAdminConsole()}>
            {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
          </Button>
        </Tooltip>
      ) : null}
      {isDesktop && activeEdition === 'enterprise' && !hasJoinedEnterprise ? (
        <Tooltip
          content={t('settings.edition.desktopLoginHint', {
            defaultValue: '桌面端1ONE Code 企业版需在浏览器登录；加入企业后工作区与个人版相同结构。',
          })}
        >
          <Button size='small' type='text' onClick={() => void openEnterpriseLoginInBrowser()}>
            {t('settings.edition.openLogin', { defaultValue: '浏览器登录' })}
          </Button>
        </Tooltip>
      ) : null}
      </div>
    </div>
  );
};

export default EditionModeSwitcher;
