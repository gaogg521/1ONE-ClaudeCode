/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Message, Modal, Select, Spin, Tabs, Typography } from '@arco-design/web-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  EnterpriseElevationPasswordMethod,
  EnterpriseElevationSecondaryOption,
} from '@/common/types/enterpriseElevation';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { EnterpriseGateProvider } from '@/renderer/pages/settings/enterpriseGateContext';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import {
  fetchEnterpriseElevation,
  isEnterpriseElevationError,
  postEnterpriseElevate,
  postEnterpriseElevateRevoke,
} from '@/renderer/utils/enterpriseElevationApi';

const VERIFY_CHOICE_STORAGE_KEY = '1one-enterprise-elevate-verify-choice';

type FlatVerifyOption =
  | { id: string; kind: 'password'; method: EnterpriseElevationPasswordMethod }
  | {
      id: string;
      kind: 'oauth';
      providerId: EnterpriseElevationSecondaryOption['id'];
      available: boolean;
    };

function buildFlatVerifyOptions(methods: EnterpriseElevationSecondaryOption[]): FlatVerifyOption[] {
  const pw = methods.filter((m) => m.kind === 'password' && m.available);
  const hasLocal = pw.some((m) => m.id === 'local_password');
  const hasLdap = pw.some((m) => m.id === 'ldap');
  const out: FlatVerifyOption[] = [];

  if (hasLocal && hasLdap) {
    out.push({ id: 'pw-auto', kind: 'password', method: 'auto' });
  }
  if (hasLocal) {
    out.push({ id: 'pw-local', kind: 'password', method: 'local_password' });
  }
  if (hasLdap) {
    out.push({ id: 'pw-ldap', kind: 'password', method: 'ldap' });
  }
  for (const m of methods.filter((x) => x.kind === 'oauth')) {
    out.push({
      id: `oauth-${m.id}`,
      kind: 'oauth',
      providerId: m.id,
      available: m.available,
    });
  }
  return out;
}

function pickDefaultVerifyChoiceId(flat: FlatVerifyOption[], saved: string | null): string {
  if (flat.length === 0) return '';
  const passwordOpts = flat.filter((o) => o.kind === 'password');
  if (saved && flat.some((o) => o.id === saved)) {
    const sel = flat.find((o) => o.id === saved)!;
    if (sel.kind === 'oauth' && !sel.available && passwordOpts.length > 0) {
      return passwordOpts[0].id;
    }
    return saved;
  }
  if (passwordOpts.length > 0) return passwordOpts[0].id;
  return flat[0].id;
}

function labelForVerifyOption(opt: FlatVerifyOption, t: TFunction): string {
  if (opt.kind === 'password') {
    if (opt.method === 'auto') {
      return t('settings.enterpriseAdmin.elevateOptionAuto', {
        defaultValue: '自动（先试本地密码，再试域账号）',
      });
    }
    if (opt.method === 'local_password') {
      return t('settings.enterpriseAdmin.elevateMethodLocal', { defaultValue: '本地密码' });
    }
    return t('settings.enterpriseAdmin.elevateMethodLdap', { defaultValue: '域账号 (LDAP)' });
  }
  const name =
    opt.providerId === 'feishu'
      ? t('settings.enterpriseAdmin.methodFeishu', { defaultValue: '飞书' })
      : opt.providerId === 'dingtalk'
        ? t('settings.enterpriseAdmin.methodDingTalk', { defaultValue: '钉钉' })
        : opt.providerId === 'wecom'
          ? t('settings.enterpriseAdmin.methodWeCom', { defaultValue: '企业微信' })
          : opt.providerId;
  if (!opt.available) {
    return `${name} (${t('settings.enterpriseAdmin.oauthComingSoon', { defaultValue: '即将上线' })})`;
  }
  return name;
}

const EnterpriseSettingsShell: React.FC = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [eligible, setEligible] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [secondaryMethods, setSecondaryMethods] = useState<EnterpriseElevationSecondaryOption[]>([]);
  const [verifyChoiceId, setVerifyChoiceId] = useState('');
  const [elevateModalOpen, setElevateModalOpen] = useState(false);
  const [elevatePassword, setElevatePassword] = useState('');
  const [elevateSubmitting, setElevateSubmitting] = useState(false);
  const [switchSubmitting, setSwitchSubmitting] = useState(false);

  const flatVerifyOptions = useMemo(() => buildFlatVerifyOptions(secondaryMethods), [secondaryMethods]);

  const selectedVerifyOption = useMemo(
    () => flatVerifyOptions.find((o) => o.id === verifyChoiceId),
    [flatVerifyOptions, verifyChoiceId]
  );

  const passwordOptionsAvailable = useMemo(
    () => secondaryMethods.filter((m) => m.kind === 'password' && m.available),
    [secondaryMethods]
  );
  const hasLocalPassword = useMemo(
    () => passwordOptionsAvailable.some((m) => m.id === 'local_password'),
    [passwordOptionsAvailable]
  );
  const hasLdapPassword = useMemo(
    () => passwordOptionsAvailable.some((m) => m.id === 'ldap'),
    [passwordOptionsAvailable]
  );
  const showPasswordForm = hasLocalPassword || hasLdapPassword;
  const hasPasswordPathInList = useMemo(
    () => flatVerifyOptions.some((o) => o.kind === 'password'),
    [flatVerifyOptions]
  );
  const showPasswordMethodPicker = flatVerifyOptions.length > 1 && hasPasswordPathInList;

  useEffect(() => {
    const saved =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(VERIFY_CHOICE_STORAGE_KEY) : null;
    setVerifyChoiceId(pickDefaultVerifyChoiceId(flatVerifyOptions, saved));
  }, [flatVerifyOptions]);

  const elevatePasswordMethod: EnterpriseElevationPasswordMethod =
    selectedVerifyOption?.kind === 'password' ? selectedVerifyOption.method : 'auto';

  const elevateDescForMethod = useMemo(() => {
    if (!showPasswordForm) {
      return t('settings.enterpriseAdmin.elevateDescNoPassword', {
        defaultValue: '当前没有可用的密码验证方式，请联系管理员设置本地密码或完成外部账号绑定。',
      });
    }
    if (selectedVerifyOption?.kind !== 'password') {
      return t('settings.enterpriseAdmin.elevateDescOAuthPick', {
        defaultValue: '请从上方选择一种验证方式。（扫码验证接入后即可使用）',
      });
    }
    if (hasLocalPassword && hasLdapPassword && elevatePasswordMethod === 'auto') {
      return t('settings.enterpriseAdmin.elevateDescAuto', {
        defaultValue: '将依次尝试本地密码与域账号密码（LDAP）。',
      });
    }
    if (elevatePasswordMethod === 'ldap' || (!hasLocalPassword && hasLdapPassword)) {
      return t('settings.enterpriseAdmin.elevateDescLdap', {
        defaultValue: '请输入已在系统中绑定的域账号（LDAP）密码。',
      });
    }
    return t('settings.enterpriseAdmin.elevateDesc', {
      defaultValue: '请输入当前登录账号的本地密码以解锁企业管理功能。',
    });
  }, [
    elevatePasswordMethod,
    hasLdapPassword,
    hasLocalPassword,
    selectedVerifyOption?.kind,
    showPasswordForm,
    t,
  ]);

  const selectOptions = useMemo(
    () =>
      flatVerifyOptions.map((o) => ({
        value: o.id,
        label: labelForVerifyOption(o, t),
        disabled: o.kind === 'oauth' && !o.available,
      })),
    [flatVerifyOptions, t]
  );

  const loadElevation = useCallback(async () => {
    const data = await fetchEnterpriseElevation();
    setEligible(data.eligible);
    setElevated(data.elevated);
    setSecondaryMethods(data.secondaryMethods);
    setStatus('ready');
    if (data.eligible && !data.elevated) {
      setElevateModalOpen(true);
    }
  }, []);

  useEffect(() => {
    setStatus('loading');
    loadElevation().catch((e: unknown) => {
      let msg: string;
      if (isEnterpriseElevationError(e)) {
        if (e.code === 'unauthorized') {
          msg = t('settings.enterpriseAdmin.elevationUnauthorized', {
            defaultValue: '登录已过期，请重新登录后再试。',
          });
        } else if (e.code === 'network') {
          msg = t('settings.enterpriseAdmin.elevationNetworkError', {
            defaultValue: '无法连接服务器，请检查网络后重试。',
          });
        } else {
          msg = t('settings.enterpriseAdmin.elevationLoadFailed', {
            defaultValue: '无法加载企业验证状态，请稍后重试。',
          });
        }
      } else if (e instanceof Error) {
        msg = e.message;
      } else {
        msg = t('settings.enterpriseAdmin.elevationLoadFailed', {
          defaultValue: '无法加载企业验证状态，请稍后重试。',
        });
      }
      Message.error(msg);
      setStatus('ready');
      setEligible(false);
      setElevated(false);
      setSecondaryMethods([]);
    });
  }, [loadElevation, t]);

  const fullAccess = eligible && elevated;

  const switchToAdminAccount = useCallback(async () => {
    setSwitchSubmitting(true);
    try {
      if (isElectronDesktop()) {
        const loginUrl =
          typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
            ? `${window.location.origin}/#/login`
            : 'http://127.0.0.1:25809/#/login';
        await openExternalUrl(loginUrl);
        Message.info(
          t('settings.enterpriseAdmin.switchAdminAccountOpened', {
            defaultValue: '已打开企业登录页，请使用管理员账号登录。',
          })
        );
        return;
      }
      await logout();
      void navigate('/login', { replace: true });
    } catch (e) {
      Message.error(
        e instanceof Error
          ? e.message
          : t('settings.enterpriseAdmin.switchAdminAccountFailed', {
              defaultValue: '无法切换账号，请稍后重试。',
            })
      );
    } finally {
      setSwitchSubmitting(false);
    }
  }, [logout, navigate, t]);

  useEffect(() => {
    if (status !== 'ready') return;
    const path = location.pathname;
    if (!eligible || !elevated) {
      if (!path.endsWith('/settings/enterprise/users')) {
        void navigate('/settings/enterprise/users', { replace: true });
      }
    }
  }, [eligible, elevated, status, location.pathname, navigate]);

  const activeTab = useMemo(() => {
    if (location.pathname.includes('/settings/enterprise/auth')) return 'auth';
    if (location.pathname.includes('/settings/enterprise/teams')) return 'teams';
    return 'users';
  }, [location.pathname]);

  const handleTabChange = useCallback(
    (key: string) => {
      if (!fullAccess) {
        Message.warning(t('settings.enterpriseAdmin.tabLocked', { defaultValue: '请先完成管理员二次验证' }));
        void navigate('/settings/enterprise/users');
        setElevateModalOpen(true);
        return;
      }
      if (key === 'auth') void navigate('/settings/enterprise/auth');
      else if (key === 'teams') void navigate('/settings/enterprise/teams');
      else void navigate('/settings/enterprise/users');
    },
    [fullAccess, navigate, t]
  );

  const submitElevate = useCallback(async () => {
    if (!showPasswordForm) {
      setElevateModalOpen(false);
      return;
    }
    const sel = selectedVerifyOption;
    if (!sel) return;
    if (sel.kind === 'oauth') {
      if (!sel.available) {
        Message.warning(t('settings.enterpriseAdmin.oauthComingSoon', { defaultValue: '即将上线' }));
        return;
      }
      Message.warning(t('settings.enterpriseAdmin.oauthNotImplemented', { defaultValue: '该方式暂未接入，请改用密码验证。' }));
      return;
    }
    if (!elevatePassword.trim()) {
      Message.warning(t('settings.enterpriseAdmin.passwordRequired', { defaultValue: '请输入密码' }));
      return;
    }
    setElevateSubmitting(true);
    try {
      await postEnterpriseElevate(elevatePassword, sel.method);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(VERIFY_CHOICE_STORAGE_KEY, verifyChoiceId);
      }
      setElevatePassword('');
      setElevateModalOpen(false);
      setElevated(true);
      Message.success(t('settings.enterpriseAdmin.elevateSuccess', { defaultValue: '验证成功' }));
      await loadElevation();
    } catch (e) {
      Message.error(e instanceof Error ? e.message : t('settings.enterpriseAdmin.elevateFailed', { defaultValue: '验证失败' }));
    } finally {
      setElevateSubmitting(false);
    }
  }, [
    elevatePassword,
    loadElevation,
    selectedVerifyOption,
    showPasswordForm,
    t,
    verifyChoiceId,
  ]);

  const primaryActionNeedsPassword =
    showPasswordForm && selectedVerifyOption?.kind === 'password';

  const gateValue = useMemo(
    () => ({
      status,
      eligible,
      elevated,
      refetch: loadElevation,
    }),
    [status, eligible, elevated, loadElevation]
  );

  return (
    <EnterpriseGateProvider value={gateValue}>
      <SettingsPageWrapper>
        <div className='flex items-center justify-between mb-16px flex-wrap gap-8px'>
          <div className='text-18px font-700 text-t-primary'>
            {t('settings.enterpriseAdmin.title', { defaultValue: '企业管理员后台' })}
          </div>
          {fullAccess ? (
            <Button
              size='small'
              onClick={() => {
                void postEnterpriseElevateRevoke()
                  .then(() => {
                    setElevated(false);
                    Message.success(t('settings.enterpriseAdmin.lockSuccess', { defaultValue: '已锁定管理会话' }));
                    void navigate('/settings/enterprise/users');
                    void loadElevation();
                  })
                  .catch((e) => Message.error(e instanceof Error ? e.message : 'Failed'));
              }}
            >
              {t('settings.enterpriseAdmin.lockSession', { defaultValue: '锁定管理会话' })}
            </Button>
          ) : null}
        </div>

        {eligible && !elevated ? (
          <Typography.Paragraph type='warning' className='mb-12px'>
            {t('settings.enterpriseAdmin.elevateHint', { defaultValue: '请选择一种验证方式并完成后解锁全员管理与系统配置。' })}
          </Typography.Paragraph>
        ) : null}

        {!eligible ? (
          <div className='mb-16px flex items-center justify-between flex-wrap gap-8px'>
            <Typography.Paragraph type='secondary' className='mb-0'>
              {t('settings.enterpriseAdmin.profileOnlyHint', {
                defaultValue: '您当前为企业普通成员，仅可查看本人账号信息。',
              })}
            </Typography.Paragraph>
            <Button size='small' loading={switchSubmitting} onClick={() => void switchToAdminAccount()}>
              {t('settings.enterpriseAdmin.switchAdminAccount', {
                defaultValue: '切换企业管理员账号',
              })}
            </Button>
          </div>
        ) : null}

        {fullAccess ? (
          <Tabs activeTab={activeTab} onChange={handleTabChange}>
            <Tabs.TabPane key='users' title={t('settings.enterpriseAdmin.tabUsers', { defaultValue: '用户与绑定' })} />
            <Tabs.TabPane key='teams' title={t('settings.enterpriseAdmin.tabTeams', { defaultValue: '团队与权限' })} />
            <Tabs.TabPane
              key='auth'
              title={t('settings.authProviders.enterprisePageTitle', { defaultValue: '系统配置' })}
            />
          </Tabs>
        ) : (
          <div className='mb-16px text-15px font-600 text-t-primary'>
            {t('settings.enterpriseAdmin.tabUsers', { defaultValue: '用户与绑定' })}
          </div>
        )}

        <div className={fullAccess ? 'mt-16px' : ''}>
          {status === 'loading' ? (
            <div className='flex justify-center py-40px'>
              <Spin />
            </div>
          ) : (
            <Outlet />
          )}
        </div>

        <Modal
          title={t('settings.enterpriseAdmin.elevateTitle', { defaultValue: '管理员二次验证' })}
          visible={eligible && !elevated && elevateModalOpen}
          onOk={() => void submitElevate()}
          okText={
            primaryActionNeedsPassword
              ? t('common.confirm', { defaultValue: '确定' })
              : t('settings.enterpriseAdmin.elevateAck', { defaultValue: '知道了' })
          }
          okButtonProps={{
            loading: elevateSubmitting,
            disabled:
              elevateSubmitting ||
              (primaryActionNeedsPassword && !elevatePassword.trim()),
          }}
          onCancel={() => setElevateModalOpen(false)}
          maskClosable={false}
        >
          {flatVerifyOptions.length > 0 ? (
            <>
              {showPasswordMethodPicker ? (
                <div className='mb-12px'>
                  <div className='text-13px text-t-secondary mb-6px'>
                    {t('settings.enterpriseAdmin.elevateChooseMethod', {
                      defaultValue: '验证方式（任选一种）',
                    })}
                  </div>
                  <Select
                    className='w-full'
                    value={verifyChoiceId || undefined}
                    options={selectOptions}
                    placeholder={t('settings.enterpriseAdmin.elevateChooseMethod', {
                      defaultValue: '验证方式（任选一种）',
                    })}
                    onChange={(v) => {
                      setVerifyChoiceId(String(v));
                      setElevatePassword('');
                    }}
                  />
                </div>
              ) : null}
              <Typography.Paragraph type='secondary' className='mb-12px'>
                {elevateDescForMethod}
              </Typography.Paragraph>
              {primaryActionNeedsPassword ? (
                <Input.Password
                  value={elevatePassword}
                  onChange={setElevatePassword}
                  placeholder={t('settings.enterpriseAdmin.passwordPlaceholder', { defaultValue: '密码' })}
                  onPressEnter={() => void submitElevate()}
                />
              ) : null}
            </>
          ) : (
            <Typography.Paragraph type='warning' className='mb-0'>
              {t('settings.enterpriseAdmin.elevateDescNoPassword', {
                defaultValue: '当前没有可用的密码验证方式，请联系管理员设置本地密码或完成外部账号绑定。',
              })}
            </Typography.Paragraph>
          )}
        </Modal>
      </SettingsPageWrapper>
    </EnterpriseGateProvider>
  );
};

export default EnterpriseSettingsShell;
