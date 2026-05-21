/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Message, Radio, Space, Switch, Tabs, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fetchWebuiApiJson, type WebuiApiJsonError } from '@/renderer/utils/webuiApiBase';
import { buildLdapUrl, LDAP_DEFAULT_PORT, parseLdapUrl } from '@/renderer/utils/ldapProviderFormUtils';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';

type ProviderId = 'ldap' | 'feishu';

type ProviderResponse = {
  provider: ProviderId;
  enabled: number;
  updated_at?: number;
  config: Record<string, unknown>;
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
    bindPassword:
      typeof row.bindPassword === 'string' && row.bindPassword !== '******' ? row.bindPassword : '',
    bindPasswordIsMasked: typeof row.bindPassword === 'string' && row.bindPassword === '******',
    tlsSkipCertVerify: row.tlsRejectUnauthorized === false,
    loginAttribute: typeof row.loginAttribute === 'string' ? row.loginAttribute : '',
    adminGroupDN: typeof row.adminGroupDN === 'string' ? row.adminGroupDN : '',
  };
}

/** Persisted LDAP row: advanced keys stay server-side defaulted; clearing on save avoids stale merged values */
function ldapConfigForPersist(
  form: LdapEditableConfig
): Omit<LdapEditableConfig, 'tlsSkipCertVerify' | 'bindPasswordIsMasked'> & {
  searchFilter: string;
  externalIdAttribute: string;
  tlsRejectUnauthorized: boolean;
} {
  const { tlsSkipCertVerify, bindPasswordIsMasked, bindPassword, host, port, useTls, ...rest } = form;
  const trimmedPwd = bindPassword.trim();
  return {
    ...rest,
    url: buildLdapUrl({ host, port, useTls }),
    bindPassword: trimmedPwd || (bindPasswordIsMasked ? '******' : ''),
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
  if (err.code === 'ENTERPRISE_ELEVATION_REQUIRED') {
    return t('settings.authProviders.errorElevationRequired', {
      defaultValue: '请先完成企业管理二次验证（页面顶部提示）后再保存。',
    });
  }
  const msg = err.message ?? '';
  if (/system admin only/i.test(msg)) {
    return t('settings.authProviders.errorPermissionOutdated', {
      defaultValue: '权限校验未通过（多为应用未重启）。请重启应用/WebUI 后重试；组织管理员应可保存。',
    });
  }
  if (/enterprise elevation/i.test(msg)) {
    return t('settings.authProviders.errorElevationRequired', {
      defaultValue: '请先完成企业管理二次验证（页面顶部提示）后再保存。',
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
  const headers = opts?.headers ? { 'Content-Type': 'application/json', ...opts.headers } : { 'Content-Type': 'application/json' };
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

const AuthProvidersModalContent: React.FC = () => {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [testingLdap, setTestingLdap] = useState(false);
  const [testingFeishu, setTestingFeishu] = useState(false);
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

  const feishuCallbackUrl = useMemo(
    () => (typeof window !== 'undefined' ? `${window.location.origin}/api/auth/feishu/callback` : ''),
    []
  );

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
    } else {
      setFeishuEnabled(Boolean(data.enabled));
      setFeishuConfig((prev) => ({ ...prev, ...data.config }));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadProvider('ldap')
      .then(() => loadProvider('feishu'))
      .catch((error) => {
        Message.error(formatAuthProviderError(error, t));
      })
      .finally(() => setLoading(false));
  }, [loadProvider, t]);

  const save = useCallback(
    async (provider: ProviderId) => {
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
        if (provider === 'ldap') {
          await apiFetch(`/api/admin/auth/providers/${provider}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: ldapEnabled, config: ldapConfigForPersist(ldapConfig) }),
          });
        } else {
          await apiFetch(`/api/admin/auth/providers/${provider}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: feishuEnabled, config: feishuConfig }),
          });
        }
        Message.success(t('settings.authProviders.saveOk', { defaultValue: '已保存' }));
        await loadProvider(provider);
      } catch (error) {
        Message.error(formatAuthProviderError(error, t));
      } finally {
        setLoading(false);
        saveBusyRef.current = false;
      }
    },
    [feishuConfig, feishuEnabled, ldapConfig, ldapEnabled, loadProvider, t]
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

  return (
    <Tabs defaultActiveTab='ldap' type='rounded'>
      <Tabs.TabPane
        key='ldap'
        title={t('settings.authProviders.tabLdap', { defaultValue: 'LDAP / 域控' })}
      >
        <Card bordered className='mt-12px'>
          <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
            <span className='text-13px text-t-secondary'>
              {t('settings.authProviders.ldapHint', {
                defaultValue: '支持 LDAP/域控登录（参数可自定义），并可配置管理员组 DN 以提升权限。',
              })}
            </span>
            <Space>
              <span className='text-13px text-t-tertiary'>{t('settings.authProviders.enableProvider', { defaultValue: '启用' })}</span>
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
                  {t('settings.authProviders.ldapTransportTls', { defaultValue: 'LDAPS（TLS 加密，默认端口 636）' })}
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
                label={t('settings.authProviders.ldapTlsSkipVerify', { defaultValue: '跳过 TLS 证书校验（仅内网）' })}
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

            <Form.Item label={t('settings.authProviders.ldapBaseDn', { defaultValue: '搜索基准 DN（Base DN）' })} required>
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
                  'Base DN 仅决定搜索范围；目录查询必须先绑定服务账号。请填写绑定 DN（推荐）或绑定账号 + 密码，否则测试连接、LDAP 搜人会失败。',
              })}
            </Typography.Paragraph>
            <Form.Item
              label={t('settings.authProviders.ldapBindDn', { defaultValue: '绑定 DN（Bind DN）' })}
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
              label={t('settings.authProviders.ldapBindAccount', { defaultValue: 'LDAP 绑定账号（可选）' })}
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
                onChange={(v) =>
                  setLdapConfig((s) => ({ ...s, bindPassword: v, bindPasswordIsMasked: false }))
                }
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
                defaultValue: '绑定 DN 与绑定账号至少填一项，并填写对应密码。仅填 Base DN 无法通过 AD 认证搜索。',
              })}
            </Typography.Paragraph>

            <Divider className='my-12px' />
            <Typography.Text bold className='text-13px'>
              {t('settings.authProviders.ldapUserSectionTitle', { defaultValue: '用户登录' })}
            </Typography.Text>
            <Form.Item label={t('settings.authProviders.loginAttribute', { defaultValue: '登录属性（loginAttribute）' })} className='mt-12px'>
              <Input
                disabled={loading}
                value={ldapConfig.loginAttribute}
                onChange={(v) => setLdapConfig((s) => ({ ...s, loginAttribute: v }))}
                placeholder='sAMAccountName / userPrincipalName / uid'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.adminGroupDn', { defaultValue: '管理员组 DN（adminGroupDN，可选）' })}>
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
            <Button type='primary' loading={loading} onClick={() => void save('ldap')}>
              {t('common.save', { defaultValue: '保存' })}
            </Button>
            <Button loading={testingLdap} onClick={() => void testLdap()} disabled={loading}>
              {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
            </Button>
          </div>
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane
        key='feishu'
        title={t('settings.authProviders.tabFeishu', { defaultValue: '飞书' })}
      >
        <Card bordered className='mt-12px'>
          <div className='flex items-center justify-between mb-12px flex-wrap gap-8px'>
            <span className='text-13px text-t-secondary'>
              {t('settings.authProviders.feishuHint', {
                defaultValue: '支持飞书 OAuth 与扫码登录。请在飞书开放平台配置 redirectUri 白名单。',
              })}
            </span>
            <Space>
              <span className='text-13px text-t-tertiary'>{t('settings.authProviders.enableProvider', { defaultValue: '启用' })}</span>
              <Switch checked={feishuEnabled} onChange={(v) => setFeishuEnabled(Boolean(v))} disabled={loading} />
            </Space>
          </div>

          <Form layout='vertical' disabled={loading}>
            <Form.Item label={t('settings.authProviders.feishuAppId', { defaultValue: '飞书 App ID' })} required>
              <Input value={feishuConfig.appId} onChange={(v) => setFeishuConfig((s) => ({ ...s, appId: v }))} placeholder='cli_xxx' />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.feishuAppSecret', { defaultValue: '飞书 App Secret' })} required>
              <Input.Password value={feishuConfig.appSecret} onChange={(v) => setFeishuConfig((s) => ({ ...s, appSecret: v }))} placeholder='******' />
            </Form.Item>
            <Form.Item
              label={t('settings.authProviders.feishuRedirectFrontend', { defaultValue: '飞书 Redirect URI（前端 / OAuth）' })}
              required
            >
              <Input
                value={feishuConfig.redirectUri}
                onChange={(v) => setFeishuConfig((s) => ({ ...s, redirectUri: v }))}
                placeholder={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/feishu/callback`}
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.feishuCallbackBackend', { defaultValue: 'OAuth 回调地址（服务端，只读）' })}>
              <Input value={feishuCallbackUrl} disabled />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.externalIdField', { defaultValue: '外部 ID 字段（externalIdField）' })}>
              <Input
                value={feishuConfig.externalIdField}
                onChange={(v) => setFeishuConfig((s) => ({ ...s, externalIdField: v }))}
                placeholder='union_id 或 open_id'
              />
            </Form.Item>
          </Form>
          <Typography.Paragraph type='secondary' className='text-12px mb-8px mt-16px'>
            {t('settings.authProviders.saveWithoutTestHint', {
              defaultValue: '无需先测试连接，填写后点「保存」即可；之后可随时回来修改或再测。',
            })}
          </Typography.Paragraph>
          <div className='flex justify-end gap-8px flex-wrap'>
            <Button type='primary' loading={loading} onClick={() => void save('feishu')}>
              {t('common.save', { defaultValue: '保存' })}
            </Button>
            <Button loading={testingFeishu} onClick={() => void testFeishu()} disabled={loading}>
              {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
            </Button>
          </div>
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key='dingtalk' title={t('settings.authProviders.tabDingTalk', { defaultValue: '钉钉' })}>
        <Typography.Paragraph type='secondary' className='mt-16px'>
          {t('settings.authProviders.providerComingSoonBody', {
            defaultValue: '该企业登录方式将后续在此提供，可与 LDAP、飞书等方式并存启用。',
          })}
        </Typography.Paragraph>
      </Tabs.TabPane>

      <Tabs.TabPane key='wecom' title={t('settings.authProviders.tabWeCom', { defaultValue: '企业微信' })}>
        <Typography.Paragraph type='secondary' className='mt-16px'>
          {t('settings.authProviders.providerComingSoonBody', {
            defaultValue: '该企业登录方式将后续在此提供，可与 LDAP、飞书等方式并存启用。',
          })}
        </Typography.Paragraph>
      </Tabs.TabPane>
    </Tabs>
  );
};

export default AuthProvidersModalContent;
