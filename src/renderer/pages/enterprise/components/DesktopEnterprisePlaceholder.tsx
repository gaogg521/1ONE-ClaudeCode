/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from 'react';
import { Alert, Button, Input, Message } from '@arco-design/web-react';
import { ArrowLeft, Copy, EveryUser, Globe, Mail, Setting, TicketOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Titlebar from '@/renderer/components/layout/Titlebar';
import EditionModeSwitcher from '@/renderer/components/layout/EditionModeSwitcher';
import EnterpriseBootstrapBanner from '@/renderer/pages/enterprise/components/EnterpriseBootstrapBanner';
import styles from '@/renderer/pages/enterprise/EnterpriseLayout.module.css';

type DesktopFeatureItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
};

type DesktopEnterprisePlaceholderProps = {
  tenantLabel: string;
  webuiApiBase: string | null;
  enterpriseBrowserUrl: string;
  openEnterpriseAdminInBrowser: () => Promise<'opened' | 'webui_not_running' | 'failed'>;
};

const DesktopEnterprisePlaceholder: React.FC<DesktopEnterprisePlaceholderProps> = ({
  tenantLabel,
  webuiApiBase,
  enterpriseBrowserUrl,
  openEnterpriseAdminInBrowser,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const desktopFeatureItems: DesktopFeatureItem[] = useMemo(
    () => [
      {
        key: 'members',
        icon: <EveryUser theme='outline' size={18} />,
        label: t('settings.enterpriseConsole.desktopFeatureMembers', { defaultValue: '成员与团队' }),
        desc: t('settings.enterpriseConsole.desktopFeatureMembersDesc', { defaultValue: '账号、角色、团队与组织架构' }),
      },
      {
        key: 'auth',
        icon: <Mail theme='outline' size={18} />,
        label: t('settings.enterpriseConsole.desktopFeatureAuth', { defaultValue: '认证与邮件' }),
        desc: t('settings.enterpriseConsole.desktopFeatureAuthDesc', { defaultValue: 'LDAP、飞书 SSO、SMTP' }),
      },
      {
        key: 'invites',
        icon: <TicketOne theme='outline' size={18} />,
        label: t('settings.enterpriseConsole.desktopFeatureInvites', { defaultValue: '邀请与治理' }),
        desc: t('settings.enterpriseConsole.desktopFeatureInvitesDesc', { defaultValue: '邀请码、安全策略入口' }),
      },
    ],
    [t]
  );

  const copyEnterpriseBrowserUrl = useCallback(async () => {
    if (!enterpriseBrowserUrl) return;
    try {
      await navigator.clipboard.writeText(enterpriseBrowserUrl);
      Message.success(
        t('settings.enterpriseConsole.desktopLinkCopied', { defaultValue: '链接已复制到剪贴板' })
      );
    } catch {
      Message.error(
        t('settings.enterpriseConsole.desktopCopyFailed', { defaultValue: '复制失败，请手动选择并复制地址' })
      );
    }
  }, [enterpriseBrowserUrl, t]);

  return (
    <div className='app-shell flex flex-col size-full min-h-0' data-enterprise-theme='true'>
      <Titlebar workspaceAvailable={false} />
      <div className='px-16px pt-8px'>
        <EditionModeSwitcher variant='bar' />
      </div>
      <div className={styles.desktopShell}>
        <div className={styles.desktopInner}>
          <div className={styles.desktopCard}>
            <div className={styles.desktopHero}>
              <div className={styles.desktopIconBadge} aria-hidden>
                <Globe theme='outline' size={28} />
              </div>
              <div className={styles.desktopHeroText}>
                <div className={styles.desktopKicker}>
                  {t('settings.enterpriseConsole.desktopKicker', { defaultValue: '组织治理' })}
                </div>
                <h1 className={styles.desktopTitle}>
                  {t('settings.enterpriseConsole.title', { defaultValue: '企业控制台' })}
                </h1>
                {tenantLabel ? (
                  <p className={styles.desktopTenant}>
                    {t('settings.enterpriseConsole.homeWelcome', {
                      defaultValue: '当前企业：{{tenant}}',
                      tenant: tenantLabel,
                    })}
                  </p>
                ) : null}
              </div>
            </div>

            <p className={styles.desktopLead}>
              {t('settings.enterpriseConsole.desktopLead', {
                defaultValue:
                  '桌面端适合日常聊天与本地 WebUI 配置。成员管理、认证与邀请码等完整能力请在浏览器中登录后使用。',
              })}
            </p>

            {/* 未认领系统管理员 / 未建企业时，桌面端直接走 IPC 认领并创建企业，无需先去浏览器登录 */}
            <EnterpriseBootstrapBanner className='mb-16px' />

            <ul className={styles.desktopFeatureList}>
              {desktopFeatureItems.map((item) => (
                <li key={item.key} className={styles.desktopFeatureRow}>
                  <span className={styles.desktopFeatureIconWrap}>{item.icon}</span>
                  <span className={styles.desktopFeatureBody}>
                    <span className={styles.desktopFeatureLabel}>{item.label}</span>
                    <span className={styles.desktopFeatureDesc}>{item.desc}</span>
                  </span>
                </li>
              ))}
            </ul>

            {!webuiApiBase ? (
              <Alert
                className={styles.desktopAlert}
                type='warning'
                content={t('settings.enterpriseConsole.desktopWebuiStopped', {
                  defaultValue:
                    '本地 WebUI 未运行，无法打开或复制地址。请先到「单机 WebUI 设置」中启动服务。',
                })}
              />
            ) : null}

            <div className={styles.desktopUrlBlock}>
              <div className={styles.desktopUrlLabel}>
                {t('settings.enterpriseConsole.desktopUrlHelp', {
                  defaultValue: '在浏览器中打开的地址',
                })}
              </div>
              <Input
                className={styles.desktopUrlInput}
                readOnly
                value={
                  enterpriseBrowserUrl ||
                  t('settings.enterpriseConsole.desktopUrlPlaceholder', {
                    defaultValue: '启动 WebUI 后将显示链接',
                  })
                }
                addAfter={
                  <Button
                    type='secondary'
                    size='small'
                    disabled={!enterpriseBrowserUrl}
                    icon={<Copy theme='outline' size={14} />}
                    onClick={() => void copyEnterpriseBrowserUrl()}
                  >
                    {t('settings.enterpriseConsole.desktopCopyLink', { defaultValue: '复制' })}
                  </Button>
                }
              />
            </div>

            <div className={styles.desktopActions}>
              <Button
                type='primary'
                size='large'
                className={styles.desktopPrimaryBtn}
                disabled={!webuiApiBase}
                icon={<Globe theme='outline' size={18} />}
                onClick={() => void openEnterpriseAdminInBrowser()}
              >
                {t('settings.webui.openEnterpriseInBrowser', { defaultValue: '在浏览器中打开企业后台' })}
              </Button>
              <div className={styles.desktopSecondaryRow}>
                <Button
                  size='large'
                  type='outline'
                  icon={<Setting theme='outline' size={16} />}
                  onClick={() => void navigate('/settings/webui')}
                >
                  {t('settings.enterpriseConsole.goStandaloneWebui', {
                    defaultValue: '单机 WebUI 设置',
                  })}
                </Button>
                <Button
                  size='large'
                  type='outline'
                  icon={<ArrowLeft theme='outline' size={16} />}
                  onClick={() => void navigate('/sessions')}
                >
                  {t('settings.enterpriseConsole.backToPersonal', { defaultValue: '返回个人工作台' })}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopEnterprisePlaceholder;
