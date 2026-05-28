/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Input, Message, Spin, Typography } from '@arco-design/web-react';
import { DataServer, HardDisk, User } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ENTERPRISE_JOIN_PATH } from '@/common/auth/enterpriseRoles';
import ChannelDingTalkLogo from '@/renderer/assets/channel-logos/dingtalk.svg';
import ChannelFeishuLogo from '@/renderer/assets/channel-logos/lark.svg';
import ChannelWecomLogo from '@/renderer/assets/channel-logos/wecom.svg';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useLoginUiProviders } from '@/renderer/hooks/auth/useLoginUiProviders';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { formatOAuthAuthorizeError, startOAuthAuthorize } from '@/renderer/utils/oauthAuthorize';
import styles from './EnterpriseLoginChannelPanel.module.css';

type LoginChannel = 'local' | 'ldap' | 'feishu' | 'dingtalk' | 'wecom';
type PasswordChannel = 'local' | 'ldap';
type ChannelStatus = 'ready' | 'disabled' | 'not_configured' | 'pending';
type OAuthChannel = 'feishu' | 'dingtalk' | 'wecom';

type ChannelMeta = {
  id: LoginChannel;
  labelKey: string;
  labelDefault: string;
  accent: string;
  icon: React.ReactNode;
};

function resolveChannelStatus(
  channel: LoginChannel,
  providers: ReturnType<typeof useLoginUiProviders>
): ChannelStatus {
  if (channel === 'local') {
    return 'ready';
  }
  if (providers.loading || providers.error !== 'none') {
    return 'ready';
  }
  if (channel === 'ldap') {
    if (providers.ldapEnabled || providers.ldapConfigured) return 'ready';
    return 'not_configured';
  }
  if (channel === 'feishu' || channel === 'dingtalk' || channel === 'wecom') {
    return 'ready';
  }
  return 'not_configured';
}

function isPasswordChannel(channel: LoginChannel): channel is PasswordChannel {
  return channel === 'local' || channel === 'ldap';
}

function isOAuthChannel(channel: LoginChannel): channel is OAuthChannel {
  return channel === 'feishu' || channel === 'dingtalk' || channel === 'wecom';
}

type EnterpriseLoginChannelPanelProps = {
  /** When true, omit outer card chrome (parent provides section layout). */
  embedded?: boolean;
};

const EnterpriseLoginChannelPanel: React.FC<EnterpriseLoginChannelPanelProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const { status, user, login, loginWithLdap, logout } = useAuth();
  const { hasJoinedEnterprise } = useWebuiEnterpriseMode();
  const providers = useLoginUiProviders();

  const [passwordChannel, setPasswordChannel] = useState<PasswordChannel | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const channels = useMemo<ChannelMeta[]>(
    () => [
      {
        id: 'feishu',
        labelKey: 'login.methods.feishu',
        labelDefault: '飞书',
        accent: '#3370ff',
        icon: <img src={ChannelFeishuLogo} alt='' className={styles.channelIconImg} />,
      },
      {
        id: 'dingtalk',
        labelKey: 'login.methods.dingtalk',
        labelDefault: '钉钉',
        accent: '#1677ff',
        icon: <img src={ChannelDingTalkLogo} alt='' className={styles.channelIconImg} />,
      },
      {
        id: 'wecom',
        labelKey: 'login.methods.wecom',
        labelDefault: '企业微信',
        accent: '#07c160',
        icon: <img src={ChannelWecomLogo} alt='' className={styles.channelIconImg} />,
      },
      {
        id: 'ldap',
        labelKey: 'login.methods.ldap',
        labelDefault: 'LDAP',
        accent: '#6366f1',
        icon: <DataServer theme='filled' size={20} fill='#6366f1' />,
      },
      {
        id: 'local',
        labelKey: 'login.methods.local',
        labelDefault: '本地账户',
        accent: '#64748b',
        icon: <HardDisk theme='filled' size={20} fill='#64748b' />,
      },
    ],
    []
  );

  const buildFeishuAuthorizePath = useCallback((mode: 'oauth' | 'qr') => {
    const params = new URLSearchParams({ mode });
    params.set('redirect', ENTERPRISE_JOIN_PATH);
    return `/api/auth/feishu/authorize?${params.toString()}`;
  }, []);

  const buildOAuthAuthorizePath = useCallback((provider: OAuthChannel) => {
    const params = new URLSearchParams({ mode: 'oauth' });
    params.set('redirect', ENTERPRISE_JOIN_PATH);
    return `/api/auth/${provider}/authorize?${params.toString()}`;
  }, []);

  const channelStatus = useMemo(
    () => ({
      local: resolveChannelStatus('local', providers),
      ldap: resolveChannelStatus('ldap', providers),
      feishu: resolveChannelStatus('feishu', providers),
      dingtalk: resolveChannelStatus('dingtalk', providers),
      wecom: resolveChannelStatus('wecom', providers),
    }),
    [providers]
  );

  const channelLabel = useCallback(
    (item: ChannelMeta) => t(item.labelKey, { defaultValue: item.labelDefault }),
    [t]
  );

  const showChannelUnavailableMessage = useCallback(
    (item: ChannelMeta) => {
      Message.warning(
        t('settings.enterpriseConsole.loginChannels.userUnavailable', {
          defaultValue: '您的企业尚未开通 {{method}} 登录，请联系管理员或改用其他方式。',
          method: channelLabel(item),
        })
      );
    },
    [channelLabel, t]
  );

  const startOAuth = useCallback(
    async (provider: OAuthChannel) => {
      const path =
        provider === 'feishu' ? buildFeishuAuthorizePath('oauth') : buildOAuthAuthorizePath(provider);
      const result = await startOAuthAuthorize(path);
      if (!result.ok) {
        Message.error(formatOAuthAuthorizeError(result.message, t, result.code));
      }
    },
    [buildFeishuAuthorizePath, buildOAuthAuthorizePath, t]
  );

  const handlePasswordLogin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!passwordChannel) {
        return;
      }
      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        Message.error(t('login.errors.empty', { defaultValue: '请输入用户名和密码' }));
        return;
      }

      setSubmitting(true);
      try {
        const result =
          passwordChannel === 'ldap'
            ? await loginWithLdap({ username: trimmedUsername, password })
            : await login({ username: trimmedUsername, password });
        if (result.success) {
          Message.success(t('login.success', { defaultValue: '登录成功！' }));
        } else {
          const text =
            result.code === 'invalidCredentials'
              ? t('login.errors.invalidCredentials')
              : result.code === 'dbUnavailable'
                ? t('login.errors.dbUnavailable')
                : (result.message ?? t('login.errors.unknown'));
          Message.error(text);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [login, loginWithLdap, password, passwordChannel, t, username]
  );

  const showLocalSessionHint = status === 'authenticated' && user != null && !hasJoinedEnterprise;

  const handleSwitchAccount = useCallback(async () => {
    setSwitchingAccount(true);
    try {
      await logout({ force: true });
      setUsername('');
      setPassword('');
      setPasswordChannel(null);
    } catch (error) {
      console.error('Failed to switch account:', error);
      Message.error(t('login.errors.unknown', { defaultValue: '退出登录失败，请稍后重试。' }));
    } finally {
      setSwitchingAccount(false);
    }
  }, [logout, t]);

  const handleChannelClick = useCallback(
    (item: ChannelMeta) => {
      if (isOAuthChannel(item.id)) {
        void startOAuth(item.id);
        return;
      }

      const currentStatus = channelStatus[item.id];
      if (isPasswordChannel(item.id)) {
        if (currentStatus === 'ready') {
          setPasswordChannel(item.id);
          return;
        }
        showChannelUnavailableMessage(item);
      }
    },
    [channelStatus, showChannelUnavailableMessage, startOAuth]
  );

  const renderPasswordForm = () => (
    <form className={styles.form} onSubmit={(event) => void handlePasswordLogin(event)}>
      <Typography.Text className={styles.formTitle}>
        {passwordChannel === 'ldap'
          ? t('login.methods.ldap', { defaultValue: 'LDAP 域控' })
          : t('login.methods.local', { defaultValue: '本地账户' })}
      </Typography.Text>
      <Typography.Text className={styles.label}>{t('login.accountName', { defaultValue: '账户名' })}</Typography.Text>
      <Input
        suffix={<User theme='outline' size='16' />}
        placeholder={t('login.accountNamePlaceholder', { defaultValue: '请输入您的账户名' })}
        autoComplete='username'
        value={username}
        onChange={setUsername}
        size='large'
        className='mb-12px'
      />
      <Typography.Text className={styles.label}>{t('login.password')}</Typography.Text>
      <Input.Password
        placeholder={t('login.passwordPlaceholder', { defaultValue: '请输入您的密码' })}
        autoComplete='current-password'
        value={password}
        onChange={setPassword}
        size='large'
        className='mb-16px'
      />
      <Button type='primary' htmlType='submit' long size='large' loading={submitting}>
        {submitting ? t('login.submitting') : t('login.submit')}
      </Button>
    </form>
  );

  const renderChannelTile = (item: ChannelMeta) => {
    const isActive = passwordChannel === item.id;

    return (
      <button
        key={item.id}
        type='button'
        className={`${styles.channelTile}${isActive ? ` ${styles.channelTileActive}` : ''}`}
        style={{ '--channel-accent': item.accent } as React.CSSProperties}
        aria-pressed={isActive}
        onClick={() => handleChannelClick(item)}
      >
        <span className={styles.channelIconWrap}>{item.icon}</span>
        <span className={styles.channelLabel}>{channelLabel(item)}</span>
      </button>
    );
  };

  if (hasJoinedEnterprise) {
    return null;
  }

  return (
    <div className={embedded ? undefined : styles.panel}>
      {showLocalSessionHint ? (
        <div className={styles.localSessionBar}>
          <Typography.Paragraph className={styles.localSessionText}>
            {t('settings.enterpriseConsole.loginChannels.localSessionHint', {
              defaultValue:
                '当前以本地账户 {{username}} 登录，尚未加入组织。请使用下方组织登录方式，或切换账号后再试。',
              username: user.username,
            })}
          </Typography.Paragraph>
          <Button
            size='mini'
            type='outline'
            loading={switchingAccount}
            onClick={() => void handleSwitchAccount()}
          >
            {t('settings.enterpriseConsole.loginChannels.switchAccount', { defaultValue: '切换账号' })}
          </Button>
        </div>
      ) : null}

      {providers.error === 'db_unavailable' ? (
        <Alert
          type='error'
          className='mb-12px'
          content={t('login.errors.dbUnavailable', {
            defaultValue: '本地数据库不可用。请关闭其他 1ONE 实例并重启应用后重试。',
          })}
        />
      ) : null}

      {providers.error === 'load_failed' ? (
        <Alert
          type='warning'
          className='mb-12px'
          content={t('login.errors.loginUiLoadFailed', {
            defaultValue: '无法加载登录配置，请刷新页面或联系管理员。',
          })}
        />
      ) : null}

      <Spin loading={providers.loading}>
        <div className={`${styles.loginLayout}${passwordChannel ? ` ${styles.loginLayoutWithForm}` : ''}`}>
          <div
            className={styles.channelGrid}
            role='listbox'
            aria-label={t('settings.enterpriseConsole.loginChannels.title', { defaultValue: '选择登录方式' })}
          >
            {channels.map(renderChannelTile)}
          </div>

          {passwordChannel ? <div className={styles.loginPanel}>{renderPasswordForm()}</div> : null}
        </div>

        {isDesktop ? (
          <Typography.Paragraph className={styles.desktopNote}>
            {t('settings.enterpriseConsole.loginChannels.desktopHintShort', {
              defaultValue: '飞书、钉钉、企微将打开系统浏览器完成授权，完成后返回本页继续加入企业。',
            })}
          </Typography.Paragraph>
        ) : null}
      </Spin>
    </div>
  );
};

export default EnterpriseLoginChannelPanel;
