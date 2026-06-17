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
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import WebuiJoinEnterprisePanel from '@/renderer/pages/settings/WebuiSettings/WebuiJoinEnterprisePanel';
import EnterpriseLoginChannelPanel from '@/renderer/pages/enterprise/components/EnterpriseLoginChannelPanel';
import styles from './EnterpriseOnboarding.module.css';

const EnterpriseOnboarding: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const resolvedRole = effectiveRole ?? user?.role;
  const canManageAuth = isEnterpriseAdminRole(resolvedRole);

  return (
    <PageContentShell contentClassName='max-w-760px'>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroBadge}>
              {t('settings.enterpriseConsole.onboardingBadge', { defaultValue: '1ONE Code 企业版' })}
            </div>
            <Typography.Title heading={4} className={styles.heroTitle}>
              {t('settings.enterpriseConsole.onboardingTitle', { defaultValue: '加入企业组织' })}
            </Typography.Title>
            <Typography.Paragraph className={styles.heroDesc}>
              {canManageAuth
                ? t('settings.enterpriseConsole.onboardingDescAdmin', {
                    defaultValue:
                      '内部成员请使用下方企业登录渠道（飞书 / 钉钉 / 企微 / LDAP / 本地账户）登录，登录成功后将自动进入企业工作区。系统管理员可前往「认证与邮件」配置登录方式；创建新企业请在管理后台完成。',
                  })
                : t('settings.enterpriseConsole.onboardingDescMember', {
                    defaultValue:
                      '请使用公司提供的登录方式（飞书、钉钉、企微、LDAP）登录。首次登录会自动创建您的企业账号并加入组织，无需邀请码；管理员在「用户管理」中维护成员与组织架构即可。',
                  })}
            </Typography.Paragraph>
          </div>
          <div className={styles.heroVisual} aria-hidden='true'>
            <img src={heroIllustration} alt='' className={styles.heroVisualImg} />
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
              {t('settings.enterpriseConsole.inviteSectionTitle', {
                defaultValue: '外部协作 / 邀请码加入（可选）',
              })}
            </h2>
          </div>
          <Typography.Paragraph type='secondary' className='text-13px mb-12px -mt-8px'>
            {t('settings.enterpriseConsole.inviteSectionDesc', {
              defaultValue:
                '团队内部成员通常通过上方登录渠道自动加入。邀请码适用于外部专家、外包人员等跨组织协作场景；验证后可预览目标企业信息再确认加入。',
            })}
          </Typography.Paragraph>
          <WebuiJoinEnterprisePanel embedded />
        </section>

        <footer className={styles.footer}>
          <Typography.Paragraph className={styles.footerText}>
            {canManageAuth
              ? t('settings.enterpriseConsole.adminAuthHint', {
                  defaultValue:
                    '您是管理员：可进入「认证与邮件」配置飞书/LDAP 等登录渠道；创建新企业请在管理后台「概览」中操作（仅系统管理员）。',
                })
              : t('settings.enterpriseConsole.standaloneHint', {
                  defaultValue: '仅需配置本机 WebUI 服务？请使用单机远程连接设置。',
                })}
          </Typography.Paragraph>
          <Button
            type='outline'
            onClick={() => {
              if (canManageAuth) {
                void navigate('/enterprise/auth');
                return;
              }
              void navigate('/settings/webui');
            }}
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
