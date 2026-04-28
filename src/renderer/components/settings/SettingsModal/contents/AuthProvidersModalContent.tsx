/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Message, Space, Switch, Tabs } from '@arco-design/web-react';
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
  const body = (await res.json().catch(() => null)) as unknown;
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

  const [active, setActive] = useState<ProviderId>('ldap');
  const [loading, setLoading] = useState(false);

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
        Message.success(t('common.saved', { defaultValue: '已保存' }));
        await loadProvider(provider);
      } catch (error) {
        Message.error(error instanceof Error ? error.message : t('common.saveFailed', { defaultValue: '保存失败' }));
      } finally {
        setLoading(false);
      }
    },
    [feishuConfig, feishuEnabled, ldapConfig, ldapEnabled, loadProvider, t]
  );

  const ldapHint = useMemo(() => {
    return t('settings.authProviders.ldapHint', {
      defaultValue: '支持 LDAP/域控登录（参数可自定义），并可配置管理员组 DN 以提升权限。',
    });
  }, [t]);

  const feishuHint = useMemo(() => {
    return t('settings.authProviders.feishuHint', {
      defaultValue: '支持飞书 OAuth 与扫码登录。请在飞书开放平台配置 redirectUri 白名单。',
    });
  }, [t]);

  return (
    <div className='flex flex-col gap-16px'>
      <Card
        bordered={false}
        title={t('settings.authProviders.title', { defaultValue: '登录与认证' })}
        extra={<span className='text-t-tertiary text-12px'>{t('settings.authProviders.adminOnly', { defaultValue: '仅管理员可配置' })}</span>}
      >
        <div className='text-t-tertiary text-13px leading-20px'>
          {t('settings.authProviders.desc', { defaultValue: '配置 WebUI 登录方式：本地账户 / LDAP 域控 / 飞书账号。外部登录需先在用户管理页绑定。' })}
        </div>
      </Card>

      <Tabs activeTab={active} onChange={(key) => setActive(key as ProviderId)}>
        <Tabs.TabPane key='ldap' title={t('login.methods.ldap', { defaultValue: '域控账号' })}>
          <Card bordered={false}>
            <div className='flex items-center justify-between mb-12px'>
              <div className='text-14px font-700'>{t('login.methods.ldap', { defaultValue: '域控账号' })}</div>
              <Space>
                <Switch checked={ldapEnabled} onChange={(v) => setLdapEnabled(Boolean(v))} />
                <Button type='primary' loading={loading} onClick={() => void save('ldap')}>
                  {t('common.save', { defaultValue: '保存' })}
                </Button>
              </Space>
            </div>
            <div className='text-13px text-t-tertiary mb-14px'>{ldapHint}</div>

            <Form layout='vertical' disabled={loading}>
              <Form.Item label='URL' required>
                <Input value={ldapConfig.url} onChange={(v) => setLdapConfig((s) => ({ ...s, url: v }))} placeholder='ldap://host:389 或 ldaps://host:636' />
              </Form.Item>
              <Form.Item label='Base DN' required>
                <Input value={ldapConfig.baseDN} onChange={(v) => setLdapConfig((s) => ({ ...s, baseDN: v }))} placeholder='DC=example,DC=com' />
              </Form.Item>
              <Form.Item label='Bind DN（可选）'>
                <Input value={ldapConfig.bindDN} onChange={(v) => setLdapConfig((s) => ({ ...s, bindDN: v }))} placeholder='CN=svc,OU=Users,DC=example,DC=com' />
              </Form.Item>
              <Form.Item label='Bind Password（可选）'>
                <Input.Password value={ldapConfig.bindPassword} onChange={(v) => setLdapConfig((s) => ({ ...s, bindPassword: v }))} placeholder='******' />
              </Form.Item>
              <Form.Item label='登录属性（loginAttribute）'>
                <Input value={ldapConfig.loginAttribute} onChange={(v) => setLdapConfig((s) => ({ ...s, loginAttribute: v }))} placeholder='sAMAccountName / userPrincipalName / uid' />
              </Form.Item>
              <Form.Item label='搜索过滤器（searchFilter）'>
                <Input value={ldapConfig.searchFilter} onChange={(v) => setLdapConfig((s) => ({ ...s, searchFilter: v }))} placeholder='(uid={{username}}) 或 (&(objectClass=person)(uid={{username}}))' />
              </Form.Item>
              <Form.Item label='外部 ID 字段（externalIdAttribute，可选）'>
                <Input value={ldapConfig.externalIdAttribute} onChange={(v) => setLdapConfig((s) => ({ ...s, externalIdAttribute: v }))} placeholder='entryUUID / objectGUID；留空则用 DN' />
              </Form.Item>
              <Form.Item label='管理员组 DN（adminGroupDN，可选）'>
                <Input value={ldapConfig.adminGroupDN} onChange={(v) => setLdapConfig((s) => ({ ...s, adminGroupDN: v }))} placeholder='CN=Admins,OU=Groups,DC=example,DC=com' />
              </Form.Item>
            </Form>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key='feishu' title={t('login.methods.feishu', { defaultValue: '飞书账号' })}>
          <Card bordered={false}>
            <div className='flex items-center justify-between mb-12px'>
              <div className='text-14px font-700'>{t('login.methods.feishu', { defaultValue: '飞书账号' })}</div>
              <Space>
                <Switch checked={feishuEnabled} onChange={(v) => setFeishuEnabled(Boolean(v))} />
                <Button type='primary' loading={loading} onClick={() => void save('feishu')}>
                  {t('common.save', { defaultValue: '保存' })}
                </Button>
              </Space>
            </div>
            <div className='text-13px text-t-tertiary mb-14px'>{feishuHint}</div>

            <Form layout='vertical' disabled={loading}>
              <Form.Item label='App ID' required>
                <Input value={feishuConfig.appId} onChange={(v) => setFeishuConfig((s) => ({ ...s, appId: v }))} placeholder='cli_xxx' />
              </Form.Item>
              <Form.Item label='App Secret' required>
                <Input.Password value={feishuConfig.appSecret} onChange={(v) => setFeishuConfig((s) => ({ ...s, appSecret: v }))} placeholder='******' />
              </Form.Item>
              <Form.Item label='Redirect URI' required>
                <Input value={feishuConfig.redirectUri} onChange={(v) => setFeishuConfig((s) => ({ ...s, redirectUri: v }))} placeholder='http://<host>:<port>/api/auth/feishu/callback' />
              </Form.Item>
              <Form.Item label='外部 ID 字段（externalIdField）'>
                <Input value={feishuConfig.externalIdField} onChange={(v) => setFeishuConfig((s) => ({ ...s, externalIdField: v }))} placeholder='union_id 或 open_id' />
              </Form.Item>
            </Form>
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default AuthProvidersModalContent;

