/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Alert, Button, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { ENTERPRISE_JOIN_PATH } from '@/common/auth/enterpriseRoles';
import { setPostLoginRedirect } from '@/renderer/utils/postLoginRedirect';

type EnterpriseEntryPathsProps = {
  compact?: boolean;
};

const EnterpriseEntryPaths: React.FC<EnterpriseEntryPathsProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = isElectronDesktop();
  const { status } = useAuth();
  const { openEnterpriseLoginInBrowser } = useWebuiEnterpriseMode();

  const goEnterpriseLogin = useCallback(async () => {
    setPostLoginRedirect(ENTERPRISE_JOIN_PATH);
    if (isDesktop) {
      const result = await openEnterpriseLoginInBrowser();
      if (result === 'webui_not_running') {
        Message.warning(
          t('settings.webui.joinNeedWebuiRunning', { defaultValue: '请先启用 WebUI 服务' })
        );
        void navigate('/settings/webui');
      } else if (result === 'failed') {
        Message.error(
          t('settings.edition.openLoginFailed', { defaultValue: '无法打开浏览器，请手动访问 WebUI 登录页' })
        );
      }
      return;
    }
    void navigate('/enterprise/join');
  }, [isDesktop, navigate, openEnterpriseLoginInBrowser, t]);

  if (compact) {
    return (
      <Alert
        type='info'
        className='mb-16px'
        content={t('settings.enterpriseConsole.entryPathsCompact', {
          defaultValue:
            '进入1ONE Code 企业版需先登录：可使用 LDAP/飞书/钉钉/企业微信（管理员启用后）或本地账户；有邀请码者在登录后可在下方加入。',
        })}
        action={
          status !== 'authenticated' || isDesktop ? (
            <Button size='small' type='primary' onClick={() => void goEnterpriseLogin()}>
              {t('settings.enterpriseConsole.goEnterpriseLogin', { defaultValue: '去登录' })}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className='mb-24px p-16px rd-12px border border-border-2 bg-2'>
      <div className='text-15px font-600 text-t-primary mb-8px'>
        {t('settings.enterpriseConsole.entryPathsTitle', { defaultValue: '进入1ONE Code 企业版' })}
      </div>
      <p className='m-0 text-13px text-t-secondary leading-relaxed mb-12px'>
        {t('settings.enterpriseConsole.entryPathsDesc', {
          defaultValue:
            '以下方式可并存：① 使用企业账号登录（LDAP 域控、飞书、钉钉、企业微信等，由管理员在「认证与邮件」中启用）；② 使用本地/WebUI 账户登录后，在下方用邀请码加入组织。',
        })}
      </p>
      <ul className='m-0 pl-18px text-13px text-t-secondary leading-relaxed mb-16px space-y-6px'>
        <li>
          {t('settings.enterpriseConsole.entryPathLogin', {
            defaultValue: '企业账号登录：域控 LDAP、飞书、钉钉、企业微信（启用后显示在登录页）',
          })}
        </li>
        <li>
          {t('settings.enterpriseConsole.entryPathInvite', {
            defaultValue: '邀请码加入：先登录任意可用方式，再输入管理员发放的邀请码',
          })}
        </li>
      </ul>
      {(status !== 'authenticated' || isDesktop) && (
        <Button type='primary' onClick={() => void goEnterpriseLogin()}>
          {isDesktop
            ? t('settings.enterpriseConsole.openLoginInBrowser', { defaultValue: '在浏览器打开企业登录页' })
            : t('settings.enterpriseConsole.goEnterpriseLogin', { defaultValue: '前往企业登录' })}
        </Button>
      )}
    </div>
  );
};

export default EnterpriseEntryPaths;
