/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import heroIllustration from '@/renderer/assets/login/enterprise-hero.svg';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import WebuiJoinEnterprisePanel from '@/renderer/pages/settings/WebuiSettings/WebuiJoinEnterprisePanel';
import EnterpriseLoginChannelPanel from '@/renderer/pages/enterprise/components/EnterpriseLoginChannelPanel';
import styles from './EnterpriseOnboarding.module.css';

const EnterpriseOnboarding: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const canManageAuth = isEnterpriseAdminRole(effectiveRole);

  return (
    <PageContentShell contentClassName='max-w-760px'>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroBadge}>
              {t('settings.enterpriseConsole.onboardingBadge', { defaultValue: '1ONE Code 企业版' })}
            </div>
            <Typography.Title heading={4} className={styles.heroTitle}>
              {t('settings.enterpriseConsole.onboardingTitle', { defaultValue: '加入或创建企业' })}
            </Typography.Title>
            <Typography.Paragraph className={styles.heroDesc}>
              {t('settings.enterpriseConsole.onboardingDesc', {
                defaultValue:
                  '企业版工作区入口：先通过飞书、钉钉、企微、LDAP 等方式登录，再用邀请码加入组织。成员与认证管理请从侧栏「管理后台」进入。',
              })}
            </Typography.Paragraph>
          </div>
          <div className={styles.heroVisual} aria-hidden='true'>
            <img
              src={heroIllustration}
              alt=''
              className={styles.heroVisualImg}
            />
          </div>
        </header>

        <section className={styles.stepSection}>
          <div className={styles.stepHeader}>
            <span className={styles.stepIndex}>1</span>
            <h2 className={styles.stepTitle}>
              {t('settings.enterpriseConsole.loginChannels.stepSignIn', { defaultValue: '登录组织账号' })}
            </h2>
          </div>
          <EnterpriseLoginChannelPanel embedded />
        </section>

        <section className={styles.stepSection}>
          <div className={styles.stepHeader}>
            <span className={`${styles.stepIndex} ${styles.stepIndexWarm}`}>2</span>
            <h2 className={styles.stepTitle}>
              {t('settings.enterpriseConsole.inviteSectionTitle', { defaultValue: '邀请码加入（需已登录）' })}
            </h2>
          </div>
          <WebuiJoinEnterprisePanel embedded />
        </section>

        <footer className={styles.footer}>
          <Typography.Paragraph className={styles.footerText}>
            {canManageAuth
              ? t('settings.enterpriseConsole.adminAuthHint', {
                  defaultValue: '您是管理员，可直接进入「认证与邮件」配置企业登录方式（如飞书/LDAP）。',
                })
              : t('settings.enterpriseConsole.standaloneHint', {
                  defaultValue: '仅需配置本机 WebUI 服务？请使用单机远程连接设置。',
                })}
          </Typography.Paragraph>
          <Button
            type='outline'
            onClick={() => void navigate(canManageAuth ? '/enterprise/auth' : '/settings/webui')}
          >
            {canManageAuth
              ? t('settings.enterpriseConsole.goEnterpriseAuth', {
                  defaultValue: '前往认证与邮件',
                })
              : t('settings.enterpriseConsole.goStandaloneWebui', {
                  defaultValue: '前往单机 WebUI 设置',
                })}
          </Button>
        </footer>
      </div>
    </PageContentShell>
  );
};

export default EnterpriseOnboarding;
