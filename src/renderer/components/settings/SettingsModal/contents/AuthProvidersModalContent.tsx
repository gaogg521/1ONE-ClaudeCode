/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Message,
  Modal,
  Radio,
  Space,
  Switch,
  Tabs,
  Typography,
} from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fetchWebuiApiJson, getWebuiApiBaseUrl, type WebuiApiJsonError } from '@/renderer/utils/webuiApiBase';
import { buildLdapUrl, LDAP_DEFAULT_PORT, parseLdapUrl } from '@/renderer/utils/ldapProviderFormUtils';
import { resolveDisplayedFeishuRedirectUri } from '@/renderer/utils/feishuProviderDisplay';
import { getDesktopAdminBearerToken } from '@/renderer/utils/webuiDesktopSession';
import { dispatchWebuiConfigRefresh } from '@/renderer/utils/webuiConfigSync';
import { syncBrowserWebuiSessionToDesktop } from '@/renderer/utils/syncBrowserWebuiSession';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isWebuiBuiltinAdministrator } from '@/common/auth/enterpriseRoles';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import { PASSWORD_MASK } from '@/common/config/constants';

type ProviderId = 'ldap' | 'feishu' | 'dingtalk' | 'wecom' | 'smtp';

const SSO_PROVIDER_IDS = new Set<ProviderId>(['ldap', 'feishu', 'dingtalk', 'wecom']);

type AuthProvidersModalContentProps = {
  visibleProviders?: ProviderId[];
  defaultActiveTab?: ProviderId;
};

type ProviderResponse = {
  provider: ProviderId;
  enabled: number;
  updated_at?: number;
  config: Record<string, unknown>;
};

type AdminEmailResponse = {
  email?: string;
};

type LdapEditableConfig = {
  host: string;
  port: string;
  /** true = ldaps:// (TLS from connect); false = ldap:// (no TLS, default 389). */
  useTls: boolean;
  baseDN: string;
  bindDN: string;
  bindAccount: string;
  bindPassword: string;
  /** Server returned masked secret; input stays empty until user types a new password. */
  bindPasswordIsMasked: boolean;
  /** LDAPS only: skip TLS cert verify (maps to tlsRejectUnauthorized: false). */
  tlsSkipCertVerify: boolean;
  loginAttribute: string;
  adminGroupDN: string;
};

function looksLikeLdapBindPrincipal(value: string): boolean {
  return value.includes('=') || value.includes('@') || value.includes('\\');
}

function coerceLdapConfig(row: Record<string, unknown>): LdapEditableConfig {
  let bindDN = typeof row.bindDN === 'string' ? row.bindDN : '';
  let bindAccount = typeof row.bindAccount === 'string' ? row.bindAccount : '';
  // Legacy: short name stored only in bindDN → treat as bind account
  if (bindDN.trim() && !bindAccount.trim() && !looksLikeLdapBindPrincipal(bindDN)) {
    bindAccount = bindDN.trim();
    bindDN = '';
  }
  const conn = parseLdapUrl(typeof row.url === 'string' ? row.url : '');
  return {
    host: conn.host,
    port: conn.port,
    useTls: conn.useTls,
    baseDN: typeof row.baseDN === 'string' ? row.baseDN : '',
    bindDN,
    bindAccount,
    bindPassword: typeof row.bindPassword === 'string' && row.bindPassword !== PASSWORD_MASK ? row.bindPassword : '',
    bindPasswordIsMasked: typeof row.bindPassword === 'string' && row.bindPassword === PASSWORD_MASK,
    tlsSkipCertVerify: row.tlsRejectUnauthorized === false,
    loginAttribute: typeof row.loginAttribute === 'string' ? row.loginAttribute : '',
    adminGroupDN: typeof row.adminGroupDN === 'string' ? row.adminGroupDN : '',
  };
}

type LdapPersistedConfig = {
  url: string;
  baseDN: string;
  bindDN: string;
  bindAccount: string;
  bindPassword: string;
  searchFilter: string;
  externalIdAttribute: string;
  tlsRejectUnauthorized: boolean;
  loginAttribute: string;
  adminGroupDN: string;
};

/** Persisted LDAP row: advanced keys stay server-side defaulted; clearing on save avoids stale merged values */
function ldapConfigForPersist(form: LdapEditableConfig): LdapPersistedConfig {
  const { tlsSkipCertVerify, bindPasswordIsMasked, bindPassword, host, port, useTls, ...rest } = form;
  const trimmedPwd = bindPassword.trim();
  return {
    baseDN: rest.baseDN,
    bindDN: rest.bindDN,
    bindAccount: rest.bindAccount,
    loginAttribute: rest.loginAttribute,
    adminGroupDN: rest.adminGroupDN,
    url: buildLdapUrl({ host, port, useTls }),
    bindPassword: trimmedPwd || (bindPasswordIsMasked ? PASSWORD_MASK : ''),
    searchFilter: '',
    externalIdAttribute: '',
    tlsRejectUnauthorized: useTls ? !tlsSkipCertVerify : true,
  };
}

function formatAuthProviderError(error: unknown, t: TFunction): string {
  if (!(error instanceof Error)) {
    return t('common.saveFailed', { defaultValue: '保存失败' });
  }
  const err = error as WebuiApiJsonError;
  const msg = err.message ?? '';
  if (err.code === 'DESKTOP_AUTH_READ_ONLY') {
    return t('settings.authProviders.desktopReadOnly', {
      defaultValue: '桌面端仅展示浏览器 WebUI 中的认证配置，请在浏览器打开企业团队版管理后台修改。',
    });
  }
  if (/system admin only/i.test(msg)) {
    return t('settings.authProviders.errorPermissionOutdated', {
      defaultValue: '权限校验未通过（多为应用未重启）。请重启应用/WebUI 后重试；组织管理员应可保存。',
    });
  }
  if (/issuer certificate|unable to get local|UNABLE_TO_VERIFY|certificate/i.test(msg)) {
    return t('settings.authProviders.errorTlsCertificate', {
      defaultValue:
        '无法验证 LDAPS 服务器证书（内网自签/企业 CA 常见）。请开启「跳过 TLS 证书校验（仅内网）」后保存并重试；生产环境更推荐导入企业根证书到系统信任库。',
    });
  }
  return msg || t('common.saveFailed', { defaultValue: '保存失败' });
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers = opts?.headers
    ? { 'Content-Type': 'application/json', ...opts.headers }
    : { 'Content-Type': 'application/json' };
  const method = String(opts?.method ?? 'GET').toUpperCase();
  const shouldAttachCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  let reqBody = opts?.body;
  if (shouldAttachCsrf && typeof reqBody === 'string') {
    try {
      reqBody = JSON.stringify(withCsrfToken(JSON.parse(reqBody)));
    } catch {
      // ignore if body is not JSON
    }
  }
  return fetchWebuiApiJson<T>(path, {
    headers,
    ...opts,
    body: reqBody,
  });
}

const DEFAULT_VISIBLE_PROVIDERS: ProviderId[] = ['ldap', 'feishu', 'dingtalk', 'wecom', 'smtp'];

const AuthProvidersModalContent: React.FC<AuthProvidersModalContentProps> = ({
  visibleProviders = DEFAULT_VISIBLE_PROVIDERS,
  defaultActiveTab,
}) => {
  const { t } = useTranslation();
  const { user, status: authStatus } = useAuth();
  const isDesktop = isElectronDesktop();
  const desktopReadOnly = isDesktop;
  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  const [webuiApiOrigin, setWebuiApiOrigin] = useState(typeof window !== 'undefined' ? window.location.origin : '');
  const enabledProviders = useMemo(
    () => DEFAULT_VISIBLE_PROVIDERS.filter((provider) => visibleProviders.includes(provider)),
    [visibleProviders]
  );
  const visibleProviderSet = useMemo(() => new Set(enabledProviders), [enabledProviders]);
  const initialActiveTab =
    defaultActiveTab && visibleProviderSet.has(defaultActiveTab) ? defaultActiveTab : (enabledProviders[0] ?? 'ldap');

  const [loading, setLoading] = useState(false);
  const [testingLdap, setTestingLdap] = useState(false);
  const [testingFeishu, setTestingFeishu] = useState(false);
  const [testingDingtalk, setTestingDingtalk] = useState(false);
  const [testingWecom, setTestingWecom] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const saveBusyRef = useRef(false);

  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapConfig, setLdapConfig] = useState<LdapEditableConfig>({
    host: '',
    port: LDAP_DEFAULT_PORT.plain,
    useTls: false,
    baseDN: '',
    bindDN: '',
    bindAccount: '',
    bindPassword: '',
    bindPasswordIsMasked: false,
    tlsSkipCertVerify: false,
    loginAttribute: '',
    adminGroupDN: '',
  });

  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [feishuConfig, setFeishuConfig] = useState({
    appId: '',
    appSecret: '',
    redirectUri: '',
    externalIdField: 'union_id',
  });

  const [dingtalkEnabled, setDingtalkEnabled] = useState(false);
  const [dingtalkSecretMasked, setDingtalkSecretMasked] = useState(false);
  const [dingtalkConfig, setDingtalkConfig] = useState({
    appKey: '',
    appSecret: '',
    corpId: '',
    redirectUri: '',
  });

  const [wecomEnabled, setWecomEnabled] = useState(false);
  const [wecomSecretMasked, setWecomSecretMasked] = useState(false);
  const [wecomConfig, setWecomConfig] = useState({
    corpId: '',
    agentId: '',
    secret: '',
    redirectUri: '',
  });

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: '587',
    secure: false,
    user: '',
    pass: '',
    passIsMasked: false,
    from: '',
    testToEmail: '',
  });
  const [adminEmail, setAdminEmail] = useState('');
  const [savingAdminEmail, setSavingAdminEmail] = useState(false);

  const feishuCallbackUrl = useMemo(
    () => resolveDisplayedFeishuRedirectUri(feishuConfig.redirectUri, webuiApiOrigin),
    [feishuConfig.redirectUri, webuiApiOrigin]
  );

  const desktopNeedsAdminLogin =
    isDesktop &&
    authStatus === 'authenticated' &&
    !getDesktopAdminBearerToken() &&
    !isWebuiBuiltinAdministrator({
      id: user?.id,
      username: user?.username,
      role: user?.role,
    });

  const ldapPreviewUrl = useMemo(
    () => buildLdapUrl({ host: ldapConfig.host, port: ldapConfig.port, useTls: ldapConfig.useTls }),
    [ldapConfig.host, ldapConfig.port, ldapConfig.useTls]
  );

  const patchLdapTransport = useCallback((useTls: boolean) => {
    setLdapConfig((s) => {
      const portIsDefault = s.port === LDAP_DEFAULT_PORT.plain || s.port === LDAP_DEFAULT_PORT.ldaps;
      return {
        ...s,
        useTls,
        port: portIsDefault ? (useTls ? LDAP_DEFAULT_PORT.ldaps : LDAP_DEFAULT_PORT.plain) : s.port,
      };
    });
  }, []);

  const loadProvider = useCallback(async (provider: ProviderId) => {
    const data = await apiFetch<ProviderResponse>(`/api/admin/auth/providers/${provider}`);
    if (provider === 'ldap') {
      setLdapEnabled(Boolean(data.enabled));
      setLdapConfig(coerceLdapConfig(data.config));
      return;
    }
    if (provider === 'feishu') {
      setFeishuEnabled(Boolean(data.enabled));
      setFeishuConfig((prev) => ({ ...prev, ...data.config }));
      return;
    }
    if (provider === 'dingtalk') {
      setDingtalkEnabled(Boolean(data.enabled));
      setDingtalkSecretMasked(data.config.appSecret === '******');
      setDingtalkConfig((prev) => ({
        appKey: String(data.config.appKey ?? prev.appKey),
        appSecret: data.config.appSecret === '******' ? '' : String(data.config.appSecret ?? prev.appSecret),
        corpId: String(data.config.corpId ?? prev.corpId),
        redirectUri: String(data.config.redirectUri ?? prev.redirectUri),
      }));
      return;
    }
    if (provider === 'wecom') {
      setWecomEnabled(Boolean(data.enabled));
      setWecomSecretMasked(data.config.secret === '******');
      setWecomConfig((prev) => ({
        corpId: String(data.config.corpId ?? prev.corpId),
        agentId: String(data.config.agentId ?? prev.agentId),
        secret: data.config.secret === '******' ? '' : String(data.config.secret ?? prev.secret),
        redirectUri: String(data.config.redirectUri ?? prev.redirectUri),
      }));
      return;
    }
    setSmtpEnabled(Boolean(data.enabled));
    setSmtpConfig((prev) => ({
      host: String(data.config.host ?? prev.host),
      port: String(data.config.port ?? prev.port),
      secure: data.config.secure === true || String(data.config.secure) === 'true',
      user: String(data.config.user ?? prev.user),
      pass: data.config.pass === '******' ? '' : String(data.config.pass ?? prev.pass),
      passIsMasked: data.config.pass === '******',
      from: String(data.config.from ?? prev.from),
      testToEmail: prev.testToEmail,
    }));
  }, []);

  const loadAdminEmail = useCallback(async () => {
    const data = await apiFetch<AdminEmailResponse>('/api/admin/system/admin-email');
    setAdminEmail(String(data.email ?? ''));
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setConfigLoadError(null);
    if (isDesktop) {
      await syncBrowserWebuiSessionToDesktop();
    }
    const tasks: Array<Promise<unknown>> = enabledProviders.map((provider) => loadProvider(provider));
    if (enabledProviders.includes('smtp')) {
      tasks.push(loadAdminEmail());
    }
    try {
      await Promise.all(tasks);
    } catch (error) {
      const message = formatAuthProviderError(error, t);
      setConfigLoadError(message);
      Message.error(message);
    } finally {
      setLoading(false);
    }
  }, [enabledProviders, isDesktop, loadAdminEmail, loadProvider, t]);

  useEffect(() => {
    void getWebuiApiBaseUrl().then((base) => {
      if (base) {
        setWebuiApiOrigin(base.replace(/\/+$/, ''));
      } else if (typeof window !== 'undefined') {
        setWebuiApiOrigin(window.location.origin);
      }
    });
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const onRefresh = () => {
      void reloadAll();
    };
    window.addEventListener('focus', onRefresh);
    window.addEventListener('one-enterprise-context-refresh', onRefresh);
    window.addEventListener('one-webui-config-refresh', onRefresh);
    return () => {
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('one-enterprise-context-refresh', onRefresh);
      window.removeEventListener('one-webui-config-refresh', onRefresh);
    };
  }, [reloadAll]);

  const persistProvider = useCallback(
    async (provider: ProviderId, allowMultipleSso = false) => {
      const withPolicy = (payload: Record<string, unknown>) =>
        JSON.stringify({
          ...payload,
          ...(allowMultipleSso ? { allowMultipleSso: true } : {}),
        });

      if (provider === 'ldap') {
        await apiFetch(`/api/admin/auth/providers/${provider}`, {
          method: 'PUT',
          body: withPolicy({ enabled: ldapEnabled, config: ldapConfigForPersist(ldapConfig) }),
        });
        return;
      }
      if (provider === 'feishu') {
        await apiFetch(`/api/admin/auth/providers/${provider}`, {
          method: 'PUT',
          body: withPolicy({ enabled: feishuEnabled, config: feishuConfig }),
        });
        return;
      }
      if (provider === 'dingtalk') {
        await apiFetch(`/api/admin/auth/providers/${provider}`, {
          method: 'PUT',
          body: withPolicy({
            enabled: dingtalkEnabled,
            config: {
              ...dingtalkConfig,
              appSecret: dingtalkConfig.appSecret.trim() || (dingtalkSecretMasked ? '******' : ''),
            },
          }),
        });
        return;
      }
      if (provider === 'wecom') {
        await apiFetch(`/api/admin/auth/providers/${provider}`, {
          method: 'PUT',
          body: withPolicy({
            enabled: wecomEnabled,
            config: {
              ...wecomConfig,
              secret: wecomConfig.secret.trim() || (wecomSecretMasked ? '******' : ''),
            },
          }),
        });
        return;
      }
      await apiFetch(`/api/admin/auth/providers/${provider}`, {
        method: 'PUT',
        body: withPolicy({
          enabled: smtpEnabled,
          config: {
            host: smtpConfig.host.trim(),
            port: smtpConfig.port.trim(),
            secure: smtpConfig.secure,
            user: smtpConfig.user.trim(),
            from: smtpConfig.from.trim(),
            pass: smtpConfig.pass.trim() || (smtpConfig.passIsMasked ? '******' : ''),
          },
        }),
      });
    },
    [
      dingtalkConfig,
      dingtalkEnabled,
      dingtalkSecretMasked,
      feishuConfig,
      feishuEnabled,
      ldapConfig,
      ldapEnabled,
      smtpConfig,
      smtpEnabled,
      wecomConfig,
      wecomEnabled,
      wecomSecretMasked,
    ]
  );

  const save = useCallback(
    async (provider: ProviderId) => {
      if (desktopReadOnly) {
        Message.warning(
          t('settings.authProviders.desktopReadOnly', {
            defaultValue: '桌面端仅展示浏览器 WebUI 中的认证配置，请在浏览器打开企业团队版管理后台修改。',
          })
        );
        return;
      }
      if (saveBusyRef.current) {
        return;
      }
      if (provider === 'ldap' && !ldapConfig.host.trim()) {
        Message.warning(t('settings.authProviders.ldapHostRequired', { defaultValue: '请填写域控 / LDAP 主机' }));
        return;
      }
      saveBusyRef.current = true;
      setLoading(true);
      try {
        await persistProvider(provider);
        Message.success(t('settings.authProviders.saveOk', { defaultValue: '已保存' }));
        await loadProvider(provider);
        dispatchWebuiConfigRefresh();
      } catch (error) {
        const err = error as WebuiApiJsonError;
        if (err.code === 'SSO_PROVIDER_CONFLICT' && SSO_PROVIDER_IDS.has(provider)) {
          Modal.confirm({
            title: t('settings.authProviders.ssoConflictTitle', {
              defaultValue: '确认启用多种企业登录？',
            }),
            content: t('settings.authProviders.ssoConflictDesc', {
              defaultValue:
                '当前已有其他企业登录方式处于启用状态。同时启用多种 SSO 可能导致多套组织架构并存、成员身份重复绑定。默认建议仅保留一种。仍要继续启用吗？',
            }),
            okText: t('common.confirm', { defaultValue: '确定' }),
            cancelText: t('common.cancel', { defaultValue: '取消' }),
            onOk: async () => {
              saveBusyRef.current = true;
              setLoading(true);
              try {
                await persistProvider(provider, true);
                Message.success(t('settings.authProviders.saveOk', { defaultValue: '已保存' }));
                await loadProvider(provider);
                dispatchWebuiConfigRefresh();
              } catch (retryError) {
                Message.error(formatAuthProviderError(retryError, t));
              } finally {
                setLoading(false);
                saveBusyRef.current = false;
              }
            },
          });
          return;
        }
        Message.error(formatAuthProviderError(error, t));
      } finally {
        setLoading(false);
        saveBusyRef.current = false;
      }
    },
    [desktopReadOnly, ldapConfig.host, loadProvider, persistProvider, t]
  );

  const testLdap = useCallback(async () => {
    if (!ldapConfig.host.trim()) {
      Message.warning(t('settings.authProviders.ldapHostRequired', { defaultValue: '请填写域控 / LDAP 主机' }));
      return;
    }
    setTestingLdap(true);
    try {
      await apiFetch(`/api/admin/auth/providers/ldap/test`, {
        method: 'POST',
        body: JSON.stringify({ config: ldapConfigForPersist(ldapConfig) }),
      });
      Message.success(t('settings.authProviders.testSuccess', { defaultValue: '连接成功' }));
    } catch (error) {
      Message.error(formatAuthProviderError(error, t));
    } finally {
      setTestingLdap(false);
    }
  }, [ldapConfig, t]);

  const testFeishu = useCallback(async () => {
    setTestingFeishu(true);
    try {
      await apiFetch(`/api/admin/auth/providers/feishu/test`, {
        method: 'POST',
        body: JSON.stringify({ config: feishuConfig }),
      });
      Message.success(t('settings.authProviders.testSuccess', { defaultValue: '连接成功' }));
    } catch (error) {
      Message.error(formatAuthProviderError(error, t));
    } finally {
      setTestingFeishu(false);
    }
  }, [feishuConfig, t]);

  const testDingtalk = useCallback(async () => {
    if (!dingtalkConfig.appKey.trim()) {
      Message.warning(t('settings.authProviders.dingtalkAppKeyRequired', { defaultValue: '请填写 AppKey' }));
      return;
    }
    setTestingDingtalk(true);
    try {
      await apiFetch(`/api/admin/auth/providers/dingtalk/test`, {
        method: 'POST',
        body: JSON.stringify({
          config: {
            ...dingtalkConfig,
            appSecret: dingtalkConfig.appSecret.trim() || (dingtalkSecretMasked ? '******' : ''),
          },
        }),
      });
      Message.success(t('settings.authProviders.testSuccess', { defaultValue: '连接成功' }));
    } catch (error) {
      Message.error(formatAuthProviderError(error, t));
    } finally {
      setTestingDingtalk(false);
    }
  }, [dingtalkConfig, dingtalkSecretMasked, t]);

  const testWecom = useCallback(async () => {
    if (!wecomConfig.corpId.trim()) {
      Message.warning(t('settings.authProviders.wecomCorpIdRequired', { defaultValue: '请填写企业 ID（CorpId）' }));
      return;
    }
    setTestingWecom(true);
    try {
      await apiFetch(`/api/admin/auth/providers/wecom/test`, {
        method: 'POST',
        body: JSON.stringify({
          config: {
            ...wecomConfig,
            secret: wecomConfig.secret.trim() || (wecomSecretMasked ? '******' : ''),
          },
        }),
      });
      Message.success(t('settings.authProviders.testSuccess', { defaultValue: '连接成功' }));
    } catch (error) {
      Message.error(formatAuthProviderError(error, t));
    } finally {
      setTestingWecom(false);
    }
  }, [wecomConfig, wecomSecretMasked, t]);

  const testSmtp = useCallback(async () => {
    setTestingSmtp(true);
    try {
      await apiFetch(`/api/admin/auth/providers/smtp/test`, {
        method: 'POST',
        body: JSON.stringify({
          config: {
            host: smtpConfig.host.trim(),
            port: smtpConfig.port.trim(),
            secure: smtpConfig.secure,
            user: smtpConfig.user.trim(),
            from: smtpConfig.from.trim(),
            pass: smtpConfig.pass.trim() || (smtpConfig.passIsMasked ? '******' : ''),
          },
          toEmail: smtpConfig.testToEmail.trim() || smtpConfig.from.trim(),
        }),
      });
      Message.success(
        t('settings.authProviders.smtpTestSuccess', { defaultValue: 'SMTP 测试成功（已验证连接并尝试发送测试邮件）' })
      );
    } catch (error) {
      Message.error(formatAuthProviderError(error, t));
    } finally {
      setTestingSmtp(false);
    }
  }, [smtpConfig, t]);

  const saveAdminEmail = useCallback(async () => {
    if (desktopReadOnly) {
      Message.warning(
        t('settings.authProviders.desktopReadOnly', {
          defaultValue: '桌面端仅展示浏览器 WebUI 中的认证配置，请在浏览器打开企业团队版管理后台修改。',
        })
      );
      return;
    }
    setSavingAdminEmail(true);
    try {
      await apiFetch('/api/admin/system/admin-email', {
        method: 'PUT',
        body: JSON.stringify({ email: adminEmail.trim() }),
      });
      Message.success(t('settings.webui.adminEmailChanged', { defaultValue: '管理员邮箱已更新' }));
      await loadAdminEmail();
    } catch (error) {
      Message.error(formatAuthProviderError(error, t));
    } finally {
      setSavingAdminEmail(false);
    }
  }, [adminEmail, desktopReadOnly, loadAdminEmail, t]);

  const oauthChannelHint = (
    <Alert
      className='mb-12px'
      type='info'
      content={t('settings.authProviders.oauthChannelHint', {
        defaultValue:
          '「测试连接」仅验证开放平台 App 凭证；保存后全组织在线客户端会实时同步登录入口。请在对应平台配置 Redirect URI 后再启用 OAuth 登录。',
      })}
    />
  );

  return (
    <>
      {isDesktop ? (
        <Alert
          type='info'
          className='mb-12px'
          content={t('settings.authProviders.desktopMirrorHint', {
            defaultValue:
              '认证配置以浏览器 WebUI 为准（同一数据库）。在浏览器登录并保存后，桌面端会自动同步展示；此处为只读镜像，不能写回服务器。',
          })}
        />
      ) : null}
      {desktopNeedsAdminLogin || configLoadError ? (
        <Alert
          type='warning'
          className='mb-12px'
          content={
            configLoadError ??
            t('settings.authProviders.desktopBrowserLoginHint', {
              defaultValue: '请先在浏览器 WebUI 使用企业管理员账号登录；登录后回到桌面端会自动同步，无需二次登录。',
            })
          }
        />
      ) : null}
      <Alert
        type='info'
        className='mb-12px'
        content={t('settings.authProviders.ssoPolicyHint', {
          defaultValue:
            '企业 SSO（LDAP / 飞书 / 钉钉 / 企微）默认仅建议同时启用一种，以避免多套组织架构冲突。邮件 SMTP 配置独立，不受此限制。',
        })}
      />
      <Tabs defaultActiveTab={initialActiveTab} type='rounded'>
        {visibleProviderSet.has('ldap') ? (
          <Tabs.TabPane key='ldap' title={t('settings.authProviders.tabLdap', { defaultValue: 'LDAP / 域控' })}>
            <Card bordered className='mt-12px'>
              <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
                <span className='text-13px text-t-secondary'>
                  {t('settings.authProviders.ldapHint', {
                    defaultValue: '支持 LDAP/域控登录（参数可自定义），并可配置管理员组 DN 以提升权限。',
                  })}
                </span>
                <Space>
                  <span className='text-13px text-t-tertiary'>
                    {t('settings.authProviders.enableProvider', { defaultValue: '启用' })}
                  </span>
                  <Switch checked={ldapEnabled} onChange={(v) => setLdapEnabled(Boolean(v))} disabled={loading} />
                </Space>
              </div>

              <Form layout='vertical'>
                <Form.Item label={t('settings.authProviders.ldapTransport', { defaultValue: '连接方式' })} required>
                  <Radio.Group
                    value={ldapConfig.useTls ? 'ldaps' : 'plain'}
                    onChange={(v) => patchLdapTransport(v === 'ldaps')}
                    disabled={loading}
                  >
                    <Radio value='plain'>
                      {t('settings.authProviders.ldapTransportPlain', { defaultValue: 'LDAP（不加密，默认端口 389）' })}
                    </Radio>
                    <Radio value='ldaps'>
                      {t('settings.authProviders.ldapTransportTls', {
                        defaultValue: 'LDAPS（TLS 加密，默认端口 636）',
                      })}
                    </Radio>
                  </Radio.Group>
                </Form.Item>

                <Alert
                  type={ldapConfig.useTls ? 'warning' : 'info'}
                  className='mb-12px'
                  content={
                    ldapConfig.useTls
                      ? t('settings.authProviders.ldapTlsModeHelp', {
                          defaultValue:
                            'LDAPS 从连接起即走 TLS。请填写域控主机名与端口（通常 636）。若测试报 unable to get local issuer certificate，说明本机不信任企业 CA：内网可开启下方「跳过 TLS 证书校验」，或把企业根证书导入系统/Node 信任库。',
                        })
                      : t('settings.authProviders.ldapPlainModeHelp', {
                          defaultValue:
                            'LDAP 不加密，仅建议可信内网。填写域控主机名（如 ldaps.intranet.example.com 的主机部分）与端口（通常 389），无需配置证书。',
                        })
                  }
                />

                <Form.Item label={t('settings.authProviders.ldapHost', { defaultValue: '域控 / LDAP 主机' })} required>
                  <Input
                    disabled={loading}
                    value={ldapConfig.host}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, host: v }))}
                    placeholder='ldaps.intranet.123u.com'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.ldapPort', { defaultValue: '端口' })}
                  required
                  extra={
                    ldapPreviewUrl
                      ? t('settings.authProviders.ldapUrlPreview', {
                          defaultValue: '实际连接：{{url}}',
                          url: ldapPreviewUrl,
                        })
                      : undefined
                  }
                >
                  <Input
                    disabled={loading}
                    value={ldapConfig.port}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, port: v.replace(/\D/g, '') }))}
                    placeholder={ldapConfig.useTls ? LDAP_DEFAULT_PORT.ldaps : LDAP_DEFAULT_PORT.plain}
                  />
                </Form.Item>

                {ldapConfig.useTls ? (
                  <Form.Item
                    label={t('settings.authProviders.ldapTlsSkipVerify', {
                      defaultValue: '跳过 TLS 证书校验（仅内网）',
                    })}
                  >
                    <div className='flex items-center gap-8px flex-wrap'>
                      <Switch
                        checked={ldapConfig.tlsSkipCertVerify}
                        onChange={(v) => setLdapConfig((s) => ({ ...s, tlsSkipCertVerify: Boolean(v) }))}
                        disabled={loading}
                      />
                      <span className='text-12px text-t-tertiary'>
                        {t('settings.authProviders.ldapTlsSkipVerifyHint', {
                          defaultValue:
                            '开启后可连接使用企业自签/内网 CA 的 LDAPS；生产环境更推荐导入根证书并关闭此项。',
                        })}
                      </span>
                    </div>
                  </Form.Item>
                ) : null}

                <Form.Item
                  label={t('settings.authProviders.ldapBaseDn', { defaultValue: '搜索基准 DN（Base DN）' })}
                  required
                >
                  <Input
                    disabled={loading}
                    value={ldapConfig.baseDN}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, baseDN: v }))}
                    placeholder='DC=example,DC=com'
                  />
                </Form.Item>

                <Divider className='my-12px' />
                <Typography.Text bold className='text-13px'>
                  {t('settings.authProviders.ldapBindSectionTitle', { defaultValue: '服务绑定账号（目录查询）' })}
                </Typography.Text>
                <Typography.Paragraph type='secondary' className='text-12px mb-12px mt-4px'>
                  {t('settings.authProviders.ldapBindSectionHint', {
                    defaultValue:
                      'Base DN 仅决定搜索范围；Windows AD 通常优先填写绑定账号（如 sAMAccountName、DOMAIN\\\\user 或 user@domain）。仅在目录明确要求时再填写完整绑定 DN，否则测试连接、LDAP 搜人会失败。',
                  })}
                </Typography.Paragraph>
                <Form.Item
                  label={t('settings.authProviders.ldapBindDn', { defaultValue: '绑定 DN（可选，仅特殊目录使用）' })}
                  required={Boolean(ldapConfig.bindPassword.trim()) && !ldapConfig.bindAccount.trim()}
                >
                  <Input
                    disabled={loading}
                    value={ldapConfig.bindDN}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, bindDN: v }))}
                    placeholder='CN=ldap,OU=users,OU=123u,DC=intranet,DC=123u,DC=com'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.ldapBindAccount', { defaultValue: '绑定账号（推荐，AD 常用）' })}
                  required={Boolean(ldapConfig.bindPassword.trim()) && !ldapConfig.bindDN.trim()}
                >
                  <Input
                    disabled={loading}
                    value={ldapConfig.bindAccount}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, bindAccount: v }))}
                    placeholder='sAMAccountName、DOMAIN\\user 或 user@domain.com（无完整 DN 时填写）'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.ldapBindPassword', { defaultValue: '绑定密码（Bind Password）' })}
                  required={
                    Boolean(ldapConfig.bindDN.trim() || ldapConfig.bindAccount.trim()) &&
                    !ldapConfig.bindPasswordIsMasked
                  }
                >
                  <Input.Password
                    visibilityToggle
                    autoComplete='new-password'
                    disabled={loading}
                    value={ldapConfig.bindPassword}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, bindPassword: v, bindPasswordIsMasked: false }))}
                    placeholder={
                      ldapConfig.bindPasswordIsMasked
                        ? t('settings.authProviders.ldapBindPasswordMaskedPlaceholder', {
                            defaultValue: '已保存密码，留空则不修改；输入新密码可覆盖',
                          })
                        : t('settings.authProviders.ldapBindPasswordPlaceholder', {
                            defaultValue: '服务账号密码',
                          })
                    }
                  />
                </Form.Item>
                <Typography.Paragraph type='secondary' className='text-12px mb-12px -mt-8px'>
                  {t('settings.authProviders.ldapBindPasswordHint', {
                    defaultValue:
                      '绑定 DN 与绑定账号二选一即可，并填写对应密码；Windows AD 通常优先使用绑定账号。仅填 Base DN 无法通过 AD 认证搜索。',
                  })}
                </Typography.Paragraph>

                <Divider className='my-12px' />
                <Typography.Text bold className='text-13px'>
                  {t('settings.authProviders.ldapUserSectionTitle', { defaultValue: '用户登录' })}
                </Typography.Text>
                <Form.Item
                  label={t('settings.authProviders.loginAttribute', { defaultValue: '登录属性（loginAttribute）' })}
                  className='mt-12px'
                >
                  <Input
                    disabled={loading}
                    value={ldapConfig.loginAttribute}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, loginAttribute: v }))}
                    placeholder='sAMAccountName / userPrincipalName / uid'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.adminGroupDn', {
                    defaultValue: '管理员组 DN（adminGroupDN，可选）',
                  })}
                >
                  <Input
                    disabled={loading}
                    value={ldapConfig.adminGroupDN}
                    onChange={(v) => setLdapConfig((s) => ({ ...s, adminGroupDN: v }))}
                    placeholder='CN=Admins,OU=Groups,DC=example,DC=com'
                  />
                </Form.Item>
              </Form>
              <Typography.Paragraph type='secondary' className='text-12px mb-8px mt-16px'>
                {t('settings.authProviders.saveWithoutTestHint', {
                  defaultValue: '无需先测试连接，填写后点「保存」即可；之后可随时回来修改或再测。',
                })}
              </Typography.Paragraph>
              <div className='flex justify-end gap-8px flex-wrap'>
                {!desktopReadOnly ? (
                  <Button type='primary' loading={loading} onClick={() => void save('ldap')}>
                    {t('common.save', { defaultValue: '保存' })}
                  </Button>
                ) : null}
                <Button loading={testingLdap} onClick={() => void testLdap()} disabled={loading}>
                  {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
                </Button>
              </div>
            </Card>
          </Tabs.TabPane>
        ) : null}

        {visibleProviderSet.has('feishu') ? (
          <Tabs.TabPane key='feishu' title={t('settings.authProviders.tabFeishu', { defaultValue: '飞书' })}>
            <Card bordered className='mt-12px'>
              <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
                <span className='text-13px text-t-secondary'>
                  {t('settings.authProviders.feishuHint', {
                    defaultValue: '支持飞书 OAuth 与扫码登录。请在飞书开放平台配置 redirectUri 白名单。',
                  })}
                </span>
                <Space>
                  <span className='text-13px text-t-tertiary'>
                    {t('settings.authProviders.enableProvider', { defaultValue: '启用' })}
                  </span>
                  <Switch checked={feishuEnabled} onChange={(v) => setFeishuEnabled(Boolean(v))} disabled={loading} />
                </Space>
              </div>

              <Form layout='vertical' disabled={loading}>
                <Form.Item label={t('settings.authProviders.feishuAppId', { defaultValue: '飞书 App ID' })} required>
                  <Input
                    value={feishuConfig.appId}
                    onChange={(v) => setFeishuConfig((s) => ({ ...s, appId: v }))}
                    placeholder='cli_xxx'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.feishuAppSecret', { defaultValue: '飞书 App Secret' })}
                  required
                >
                  <Input.Password
                    value={feishuConfig.appSecret}
                    onChange={(v) => setFeishuConfig((s) => ({ ...s, appSecret: v }))}
                    placeholder='******'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.feishuRedirectFrontend', {
                    defaultValue: '飞书 Redirect URI（开放平台）',
                  })}
                  extra={t('settings.authProviders.feishuRedirectHint', {
                    defaultValue:
                      '请填写飞书开放平台可访问的回调地址，不能使用 localhost；建议填写局域网 IP 或正式域名。',
                  })}
                  required
                >
                  <Input
                    value={feishuConfig.redirectUri}
                    onChange={(v) => setFeishuConfig((s) => ({ ...s, redirectUri: v }))}
                    placeholder={t('settings.authProviders.feishuRedirectPlaceholder', {
                      defaultValue: 'http://your-lan-ip:25809/api/auth/feishu/callback',
                    })}
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.feishuCallbackBackend', {
                    defaultValue: '当前生效回调地址（登录实际使用）',
                  })}
                >
                  <Input value={feishuCallbackUrl} disabled />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.externalIdField', {
                    defaultValue: '外部 ID 字段（externalIdField）',
                  })}
                >
                  <Input
                    value={feishuConfig.externalIdField}
                    onChange={(v) => setFeishuConfig((s) => ({ ...s, externalIdField: v }))}
                    placeholder='union_id 或 open_id'
                  />
                </Form.Item>
                <Typography.Paragraph type='secondary' className='text-12px mb-8px'>
                  {t('settings.authProviders.feishuBindingHint', {
                    defaultValue:
                      '保存飞书配置后，还需要到「用户管理」里为本地账号绑定 union_id / open_id，否则 OAuth 回调会被拒绝。',
                  })}
                </Typography.Paragraph>
              </Form>
              <Typography.Paragraph type='secondary' className='text-12px mb-8px mt-16px'>
                {t('settings.authProviders.saveWithoutTestHint', {
                  defaultValue: '无需先测试连接，填写后点「保存」即可；之后可随时回来修改或再测。',
                })}
              </Typography.Paragraph>
              <div className='flex justify-end gap-8px flex-wrap'>
                {!desktopReadOnly ? (
                  <Button type='primary' loading={loading} onClick={() => void save('feishu')}>
                    {t('common.save', { defaultValue: '保存' })}
                  </Button>
                ) : null}
                <Button loading={testingFeishu} onClick={() => void testFeishu()} disabled={loading}>
                  {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
                </Button>
              </div>
            </Card>
          </Tabs.TabPane>
        ) : null}

        {visibleProviderSet.has('dingtalk') ? (
          <Tabs.TabPane key='dingtalk' title={t('settings.authProviders.tabDingTalk', { defaultValue: '钉钉' })}>
            <Card bordered className='mt-12px'>
              {oauthChannelHint}
              <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
                <span className='text-13px text-t-secondary'>
                  {t('settings.authProviders.dingtalkHint', {
                    defaultValue: '配置钉钉开放平台应用，用于企业扫码/免登登录（与 LDAP、飞书可并存）。',
                  })}
                </span>
                <Space>
                  <span className='text-13px text-t-tertiary'>
                    {t('settings.authProviders.enableProvider', { defaultValue: '启用' })}
                  </span>
                  <Switch
                    checked={dingtalkEnabled}
                    onChange={(v) => setDingtalkEnabled(Boolean(v))}
                    disabled={loading}
                  />
                </Space>
              </div>
              <Form layout='vertical' disabled={loading}>
                <Form.Item
                  label={t('settings.authProviders.dingtalkAppKey', { defaultValue: 'AppKey / Client ID' })}
                  required
                >
                  <Input
                    value={dingtalkConfig.appKey}
                    onChange={(v) => setDingtalkConfig((s) => ({ ...s, appKey: v }))}
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.dingtalkAppSecret', { defaultValue: 'AppSecret' })}
                  required
                >
                  <Input.Password
                    value={dingtalkConfig.appSecret}
                    onChange={(v) => {
                      setDingtalkConfig((s) => ({ ...s, appSecret: v }));
                      setDingtalkSecretMasked(false);
                    }}
                  />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.dingtalkCorpId', { defaultValue: 'CorpId（可选）' })}>
                  <Input
                    value={dingtalkConfig.corpId}
                    onChange={(v) => setDingtalkConfig((s) => ({ ...s, corpId: v }))}
                  />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.dingtalkRedirectUri', { defaultValue: 'Redirect URI' })}>
                  <Input
                    value={dingtalkConfig.redirectUri}
                    onChange={(v) => setDingtalkConfig((s) => ({ ...s, redirectUri: v }))}
                    placeholder={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/dingtalk/callback`}
                  />
                </Form.Item>
              </Form>
              <div className='flex justify-end gap-8px flex-wrap mt-16px'>
                {!desktopReadOnly ? (
                  <Button type='primary' loading={loading} onClick={() => void save('dingtalk')}>
                    {t('common.save', { defaultValue: '保存' })}
                  </Button>
                ) : null}
                <Button loading={testingDingtalk} onClick={() => void testDingtalk()} disabled={loading}>
                  {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
                </Button>
              </div>
            </Card>
          </Tabs.TabPane>
        ) : null}

        {visibleProviderSet.has('wecom') ? (
          <Tabs.TabPane key='wecom' title={t('settings.authProviders.tabWeCom', { defaultValue: '企业微信' })}>
            <Card bordered className='mt-12px'>
              {oauthChannelHint}
              <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
                <span className='text-13px text-t-secondary'>
                  {t('settings.authProviders.wecomHint', {
                    defaultValue: '配置企业微信自建应用，用于成员扫码登录（与 LDAP、飞书可并存）。',
                  })}
                </span>
                <Space>
                  <span className='text-13px text-t-tertiary'>
                    {t('settings.authProviders.enableProvider', { defaultValue: '启用' })}
                  </span>
                  <Switch checked={wecomEnabled} onChange={(v) => setWecomEnabled(Boolean(v))} disabled={loading} />
                </Space>
              </div>
              <Form layout='vertical' disabled={loading}>
                <Form.Item
                  label={t('settings.authProviders.wecomCorpId', { defaultValue: '企业 ID（CorpId）' })}
                  required
                >
                  <Input value={wecomConfig.corpId} onChange={(v) => setWecomConfig((s) => ({ ...s, corpId: v }))} />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.wecomAgentId', { defaultValue: '应用 AgentId' })} required>
                  <Input value={wecomConfig.agentId} onChange={(v) => setWecomConfig((s) => ({ ...s, agentId: v }))} />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.wecomSecret', { defaultValue: '应用 Secret' })} required>
                  <Input.Password
                    value={wecomConfig.secret}
                    onChange={(v) => {
                      setWecomConfig((s) => ({ ...s, secret: v }));
                      setWecomSecretMasked(false);
                    }}
                  />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.wecomRedirectUri', { defaultValue: 'Redirect URI' })}>
                  <Input
                    value={wecomConfig.redirectUri}
                    onChange={(v) => setWecomConfig((s) => ({ ...s, redirectUri: v }))}
                    placeholder={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/wecom/callback`}
                  />
                </Form.Item>
              </Form>
              <div className='flex justify-end gap-8px flex-wrap mt-16px'>
                {!desktopReadOnly ? (
                  <Button type='primary' loading={loading} onClick={() => void save('wecom')}>
                    {t('common.save', { defaultValue: '保存' })}
                  </Button>
                ) : null}
                <Button loading={testingWecom} onClick={() => void testWecom()} disabled={loading}>
                  {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
                </Button>
              </div>
            </Card>
          </Tabs.TabPane>
        ) : null}

        {visibleProviderSet.has('smtp') ? (
          <Tabs.TabPane key='smtp' title={t('settings.authProviders.tabSmtp', { defaultValue: '邮箱配置' })}>
            <Card bordered className='mt-12px'>
              <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
                <span className='text-13px text-t-secondary'>
                  {t('settings.authProviders.smtpHint', {
                    defaultValue:
                      '用于管理员密码重置邮件、企业通知等。保存后优先于环境变量 ONE_SMTP_*；未启用时仍可使用环境变量。',
                  })}
                </span>
                <Space>
                  <span className='text-13px text-t-tertiary'>
                    {t('settings.authProviders.enableProvider', { defaultValue: '启用' })}
                  </span>
                  <Switch checked={smtpEnabled} onChange={(v) => setSmtpEnabled(Boolean(v))} disabled={loading} />
                </Space>
              </div>
              <Form layout='vertical' disabled={loading}>
                <Form.Item label={t('settings.webui.adminEmail', { defaultValue: '管理员邮箱' })}>
                  <Input
                    value={adminEmail}
                    onChange={setAdminEmail}
                    placeholder={t('settings.webui.adminEmailPlaceholder', {
                      defaultValue: '例如: admin@company.com',
                    })}
                  />
                </Form.Item>
                <div className='flex justify-end mb-12px'>
                  {!desktopReadOnly ? (
                    <Button loading={savingAdminEmail} onClick={() => void saveAdminEmail()} disabled={loading}>
                      {t('settings.webui.setAdminEmail', { defaultValue: '设置管理员邮箱' })}
                    </Button>
                  ) : null}
                </div>
                <Form.Item label={t('settings.authProviders.smtpHost', { defaultValue: 'SMTP 主机' })} required>
                  <Input
                    value={smtpConfig.host}
                    onChange={(v) => setSmtpConfig((s) => ({ ...s, host: v }))}
                    placeholder='smtp.example.com'
                  />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.smtpPort', { defaultValue: '端口' })} required>
                  <Input
                    value={smtpConfig.port}
                    onChange={(v) => setSmtpConfig((s) => ({ ...s, port: v.replace(/\D/g, '') }))}
                    placeholder='587'
                  />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.smtpSecure', { defaultValue: 'TLS / SSL（secure）' })}>
                  <Switch
                    checked={smtpConfig.secure}
                    onChange={(v) => setSmtpConfig((s) => ({ ...s, secure: Boolean(v) }))}
                  />
                </Form.Item>
                <Form.Item label={t('settings.authProviders.smtpUser', { defaultValue: '用户名' })} required>
                  <Input value={smtpConfig.user} onChange={(v) => setSmtpConfig((s) => ({ ...s, user: v }))} />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.smtpPass', { defaultValue: '密码' })}
                  required={!smtpConfig.passIsMasked}
                >
                  <Input.Password
                    value={smtpConfig.pass}
                    onChange={(v) => setSmtpConfig((s) => ({ ...s, pass: v, passIsMasked: false }))}
                    placeholder={
                      smtpConfig.passIsMasked
                        ? t('settings.authProviders.ldapBindPasswordMaskedPlaceholder', {
                            defaultValue: '已保存密码，留空则不修改；输入新密码可覆盖',
                          })
                        : undefined
                    }
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.smtpFrom', { defaultValue: '发件人地址（From）' })}
                  required
                >
                  <Input
                    value={smtpConfig.from}
                    onChange={(v) => setSmtpConfig((s) => ({ ...s, from: v }))}
                    placeholder='noreply@example.com'
                  />
                </Form.Item>
                <Form.Item
                  label={t('settings.authProviders.smtpTestTo', { defaultValue: '测试收件人（可选）' })}
                  extra={t('settings.authProviders.smtpTestToHint', { defaultValue: '留空则向发件人地址发送测试邮件' })}
                >
                  <Input
                    value={smtpConfig.testToEmail}
                    onChange={(v) => setSmtpConfig((s) => ({ ...s, testToEmail: v }))}
                  />
                </Form.Item>
              </Form>
              <div className='flex justify-end gap-8px flex-wrap mt-16px'>
                {!desktopReadOnly ? (
                  <Button type='primary' loading={loading} onClick={() => void save('smtp')}>
                    {t('common.save', { defaultValue: '保存' })}
                  </Button>
                ) : null}
                <Button loading={testingSmtp} onClick={() => void testSmtp()} disabled={loading}>
                  {t('settings.authProviders.smtpTestSend', { defaultValue: '测试发信' })}
                </Button>
              </div>
            </Card>
          </Tabs.TabPane>
        ) : null}
      </Tabs>
    </>
  );
};

export default AuthProvidersModalContent;
