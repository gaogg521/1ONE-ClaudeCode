/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Message, Space, Switch, Tabs, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';

type ProviderId = 'ldap' | 'feishu';

type ProviderResponse = {
  provider: ProviderId;
  enabled: number;
  updated_at?: number;
  config: Record<string, unknown>;
};

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
  const res = await fetch(path, {
    headers,
    credentials: 'include',
    ...opts,
    body: reqBody,
  });
  const body = (await res.json().catch((): null => null)) as unknown;
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const success = obj?.success === true;
  if (!res.ok || !success) {
    const message = (obj?.message ?? obj?.error) as string | undefined;
    throw new Error(message || res.statusText);
  }
  return (obj?.data as T) ?? ({} as T);
}

const AuthProvidersModalContent: React.FC = () => {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [testingLdap, setTestingLdap] = useState(false);
  const [testingFeishu, setTestingFeishu] = useState(false);

  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapConfig, setLdapConfig] = useState({
    url: '',
    baseDN: '',
    bindDN: '',
    bindPassword: '',
    loginAttribute: '',
    searchFilter: '',
    externalIdAttribute: '',
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

  const loadProvider = useCallback(async (provider: ProviderId) => {
    const data = await apiFetch<ProviderResponse>(`/api/admin/auth/providers/${provider}`);
    if (provider === 'ldap') {
      setLdapEnabled(Boolean(data.enabled));
      setLdapConfig((prev) => ({ ...prev, ...data.config }));
    } else {
      setFeishuEnabled(Boolean(data.enabled));
      setFeishuConfig((prev) => ({ ...prev, ...data.config }));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadProvider('ldap')
      .then(() => loadProvider('feishu'))
      .finally(() => setLoading(false));
  }, [loadProvider]);

  const save = useCallback(
    async (provider: ProviderId) => {
      setLoading(true);
      try {
        if (provider === 'ldap') {
          await apiFetch(`/api/admin/auth/providers/${provider}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: ldapEnabled, config: ldapConfig }),
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
        Message.error(error instanceof Error ? error.message : t('common.saveFailed', { defaultValue: '保存失败' }));
      } finally {
        setLoading(false);
      }
    },
    [feishuConfig, feishuEnabled, ldapConfig, ldapEnabled, loadProvider, t]
  );

  const testLdap = useCallback(async () => {
    setTestingLdap(true);
    try {
      await apiFetch(`/api/admin/auth/providers/ldap/test`, {
        method: 'POST',
        body: JSON.stringify({ config: ldapConfig }),
      });
      Message.success(t('settings.authProviders.testSuccess', { defaultValue: '连接成功' }));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('settings.authProviders.testFailed', { defaultValue: '连接失败' }));
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
      Message.error(error instanceof Error ? error.message : t('settings.authProviders.testFailed', { defaultValue: '连接失败' }));
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

          <Form layout='vertical' disabled={loading}>
            <Form.Item label={t('settings.authProviders.ldapUrl', { defaultValue: 'LDAP 服务器地址' })} required>
              <Input
                value={ldapConfig.url}
                onChange={(v) => setLdapConfig((s) => ({ ...s, url: v }))}
                placeholder='ldap://host:389 或 ldaps://host:636'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.ldapBaseDn', { defaultValue: '搜索基准 DN（Base DN）' })} required>
              <Input value={ldapConfig.baseDN} onChange={(v) => setLdapConfig((s) => ({ ...s, baseDN: v }))} placeholder='DC=example,DC=com' />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.ldapBindDn', { defaultValue: '绑定 DN（Bind DN）' })}>
              <Input
                value={ldapConfig.bindDN}
                onChange={(v) => setLdapConfig((s) => ({ ...s, bindDN: v }))}
                placeholder='CN=svc,OU=Users,DC=example,DC=com'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.ldapBindPassword', { defaultValue: '绑定密码（Bind Password）' })}>
              <Input.Password
                value={ldapConfig.bindPassword}
                onChange={(v) => setLdapConfig((s) => ({ ...s, bindPassword: v }))}
                placeholder='******'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.loginAttribute', { defaultValue: '登录属性（loginAttribute）' })}>
              <Input
                value={ldapConfig.loginAttribute}
                onChange={(v) => setLdapConfig((s) => ({ ...s, loginAttribute: v }))}
                placeholder='sAMAccountName / userPrincipalName / uid'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.searchFilter', { defaultValue: '搜索过滤器（searchFilter）' })}>
              <Input
                value={ldapConfig.searchFilter}
                onChange={(v) => setLdapConfig((s) => ({ ...s, searchFilter: v }))}
                placeholder='(uid={{username}}) 或 (&(objectClass=person)(uid={{username}}))'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.externalIdAttribute', { defaultValue: '外部 ID 字段（externalIdAttribute，可选）' })}>
              <Input
                value={ldapConfig.externalIdAttribute}
                onChange={(v) => setLdapConfig((s) => ({ ...s, externalIdAttribute: v }))}
                placeholder='entryUUID / objectGUID；留空则用 DN'
              />
            </Form.Item>
            <Form.Item label={t('settings.authProviders.adminGroupDn', { defaultValue: '管理员组 DN（adminGroupDN，可选）' })}>
              <Input
                value={ldapConfig.adminGroupDN}
                onChange={(v) => setLdapConfig((s) => ({ ...s, adminGroupDN: v }))}
                placeholder='CN=Admins,OU=Groups,DC=example,DC=com'
              />
            </Form.Item>
          </Form>
          <div className='flex justify-end gap-8px mt-16px flex-wrap'>
            <Button loading={testingLdap} onClick={() => void testLdap()} disabled={loading}>
              {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
            </Button>
            <Button type='primary' loading={loading} onClick={() => void save('ldap')}>
              {t('common.save', { defaultValue: '保存' })}
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
          <div className='flex justify-end gap-8px mt-16px flex-wrap'>
            <Button loading={testingFeishu} onClick={() => void testFeishu()} disabled={loading}>
              {t('settings.authProviders.testConnection', { defaultValue: '测试连接' })}
            </Button>
            <Button type='primary' loading={loading} onClick={() => void save('feishu')}>
              {t('common.save', { defaultValue: '保存' })}
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
