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
    canUseEnterpriseEditionSwitcher,
  } = useWebuiEnterpriseMode();

  /** 版本切换只看 managementMode，与 /enterprise 管理后台路由无关 */
  const activeEdition: WebuiManagementMode = managementMode;

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

  const switchEdition = useCallback(
    (next: WebuiManagementMode) => {
      if (next === 'enterprise' && !canUseEnterpriseEditionSwitcher) {
        return;
      }
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
          void navigate('/sessions');
          return;
        }
        void navigate('/sessions');
      });
    },
    [
      canUseEnterpriseEditionSwitcher,
      hasJoinedEnterprise,
      isDesktop,
      navigate,
      setManagementMode,
      status,
    ]
  );

  if (loading) {
    return null;
  }

  const enterpriseAdminConsoleLabel = t('settings.edition.enterpriseAdminConsole', {
    defaultValue: '企业团队版管理后台',
  });

  // 已加入企业：不显示切换器，直接展示企业身份标识 + 管理后台入口
  if (hasJoinedEnterprise) {
    const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId;
    const isEnterpriseGuest = status !== 'authenticated';
    const enterpriseTagLabel = isEnterpriseGuest
      ? t('settings.edition.enterpriseInstanceTag', {
          defaultValue: '企业实例 · {{tenant}}',
          tenant: tenantLabel ?? t('settings.edition.joined', { defaultValue: '已接入企业' }),
        })
      : (tenantLabel ?? t('settings.edition.joined', { defaultValue: '已加入企业' }));
    if (variant === 'compact') {
      return (
        <div className={styles.compact}>
          <Tag size='small' color='arcoblue'>{enterpriseTagLabel}</Tag>
          {isEnterpriseGuest ? (
            <Button size='mini' type='text' onClick={() => void openEnterpriseLoginInBrowser()}>
              {t('settings.edition.enterpriseLoginAction', { defaultValue: '登录企业账号' })}
            </Button>
          ) : null}
          {showEnterpriseAdminNav ? (
            <Button size='mini' type='text' onClick={() => void openAdminConsole()}>
              {enterpriseAdminConsoleLabel}
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <div className={styles.bar}>
        <div className={styles.barTop}>
          <div className={styles.barLeft}>
            <Tag color='arcoblue'>{enterpriseTagLabel}</Tag>
          </div>
          {isEnterpriseGuest ? (
            <Button size='small' type='text' onClick={() => void openEnterpriseLoginInBrowser()}>
              {t('settings.edition.enterpriseLoginAction', { defaultValue: '登录企业账号' })}
            </Button>
          ) : null}
          {showEnterpriseAdminNav ? (
            <Button size='small' type='outline' onClick={() => void openAdminConsole()}>
              {enterpriseAdminConsoleLabel}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId;
  const personalLabel = t('settings.edition.personal', { defaultValue: '个人版' });
  const enterpriseLabel = t('settings.edition.enterprise', { defaultValue: '企业团队版' });
  const helpContent = (
    <div className={styles.helpPopover}>
      <p className={styles.helpTitle}>{t('settings.edition.helpTitle', { defaultValue: '个人版 / 企业团队版 / 管理后台 区别' })}</p>
      <p className={styles.helpP}>
        {t('settings.edition.helpPersonal', {
          defaultValue: '个人版：本机/自己的账号与数据，界面即当前会话工作区。',
        })}
      </p>
      <p className={styles.helpP}>
        {t('settings.edition.helpEnterprise', {
          defaultValue:
            '企业团队版：同一套工作区，但以企业身份使用（需先加入）。界面不会变成「管理页」。',
        })}
      </p>
      <p className={styles.helpP}>
        {t('settings.edition.helpAdmin', {
          defaultValue: '管理后台：仅管理员在侧栏进入，用于成员、LDAP、邀请码等，与版本切换无关。',
        })}
      </p>
    </div>
  );

  const enterpriseEditionDisabled = !canUseEnterpriseEditionSwitcher;
  const enterpriseDisabledHint = t('settings.edition.enterpriseSwitcherDisabled', {
    defaultValue: '企业团队版模式尚未对成员开放，请联系系统管理员在管理后台启用。',
  });

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
          <Tooltip content={enterpriseEditionDisabled ? enterpriseDisabledHint : undefined}>
            <Radio value='enterprise' disabled={enterpriseEditionDisabled}>
              {enterpriseLabel}
            </Radio>
          </Tooltip>
        </Radio.Group>
        {showEnterpriseAdminNav ? (
          <Button size='mini' type='text' onClick={() => void openAdminConsole()}>
            {enterpriseAdminConsoleLabel}
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
          <Tooltip content={enterpriseEditionDisabled ? enterpriseDisabledHint : undefined}>
            <Radio value='enterprise' disabled={enterpriseEditionDisabled}>
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
          </Tooltip>
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
            defaultValue: '企业团队版管理后台（成员、LDAP、邀请码、邮件）与上方「企业团队版」工作区是独立入口。',
          })}
        >
          <Button size='small' type='outline' onClick={() => void openAdminConsole()}>
            {enterpriseAdminConsoleLabel}
          </Button>
        </Tooltip>
      ) : null}
      {isDesktop && activeEdition === 'enterprise' && !hasJoinedEnterprise && !showEnterpriseAdminNav ? (
        <Tooltip
          content={t('settings.edition.desktopLoginHint', {
            defaultValue: '桌面端需先在浏览器完成组织账号登录，再回到此页加入企业。',
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
