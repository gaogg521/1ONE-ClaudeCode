/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Menu, Message, Modal, Select, Spin, Tag, Typography } from '@arco-design/web-react';
import { ArrowLeft, Copy, EveryUser, Globe, Mail, Setting, TicketOne } from '@icon-park/react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EnterpriseElevationPasswordMethod } from '@/common/types/enterpriseElevation';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { EnterpriseGateProvider } from '@/renderer/pages/settings/enterpriseGateContext';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import {
  fetchEnterpriseElevation,
  isEnterpriseElevationError,
  postEnterpriseElevate,
  postEnterpriseElevateRevoke,
} from '@/renderer/utils/enterpriseElevationApi';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import EnterpriseOnboarding from '@/renderer/pages/enterprise/EnterpriseOnboarding';
import {
  ENTERPRISE_NAV_ITEMS,
  enterpriseNavKeyFromPath,
} from '@/renderer/pages/enterprise/enterpriseNav';
import {
  buildFlatVerifyOptions,
  formatEnterpriseElevateError,
  formatEnterpriseRole,
  labelForVerifyOption,
  pickDefaultVerifyChoiceId,
  VERIFY_CHOICE_STORAGE_KEY,
} from '@/renderer/pages/enterprise/enterpriseElevationUi';
import { ENTERPRISE_HOME_PATH, ENTERPRISE_USERS_PATH } from '@/renderer/pages/enterprise/paths';
import styles from '@/renderer/pages/enterprise/EnterpriseLayout.module.css';

const EnterpriseLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = isElectronDesktop();
  const {
    loading: enterpriseModeLoading,
    hasJoinedEnterprise,
    showEnterpriseConsoleNav,
    enterpriseContext,
    openEnterpriseAdminInBrowser,
    webuiApiBase,
  } = useWebuiEnterpriseMode();

  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [eligible, setEligible] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [secondaryMethods, setSecondaryMethods] = useState<
    import('@/common/types/enterpriseElevation').EnterpriseElevationSecondaryOption[]
  >([]);
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
    selectedVerifyOption?.kind === 'password' && !selectedVerifyOption.locked
      ? selectedVerifyOption.method
      : 'auto';

  const elevateDescForMethod = useMemo(() => {
    if (
      selectedVerifyOption?.kind === 'password' &&
      selectedVerifyOption.locked &&
      selectedVerifyOption.lockedReason === 'ldap_not_bound'
    ) {
      return t('settings.enterpriseAdmin.elevateDescLdapLockedNotBound', {
        defaultValue:
          '要使用域账号密码，需要先在系统中将您的账号与该域身份绑定（与 LDAP 登录策略一致）。请使用下面的「本地密码」完成验证；绑定完成后即可选择域账号 (LDAP)。',
      });
    }
    if (
      selectedVerifyOption?.kind === 'password' &&
      selectedVerifyOption.locked &&
      selectedVerifyOption.lockedReason === 'ldap_not_configured'
    ) {
      return t('settings.enterpriseAdmin.elevateDescLdapLockedNotConfigured', {
        defaultValue: 'LDAP 尚未启用或未填写服务器地址/Base DN，无法使用域密码。请先在「认证与邮件」中完成配置，或使用本地密码。',
      });
    }
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
    selectedVerifyOption?.locked,
    selectedVerifyOption?.lockedReason,
    showPasswordForm,
    t,
  ]);

  const selectOptions = useMemo(
    () =>
      flatVerifyOptions.map((o) => ({
        value: o.id,
        label: labelForVerifyOption(o, t),
        disabled: (o.kind === 'oauth' && !o.available) || (o.kind === 'password' && Boolean(o.locked)),
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
    if (enterpriseModeLoading || isDesktop) return;
    if (!hasJoinedEnterprise) return;
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
  }, [enterpriseModeLoading, hasJoinedEnterprise, isDesktop, loadElevation, t]);

  const fullAccess = eligible && elevated;
  const activeNavKey = enterpriseNavKeyFromPath(location.pathname);
  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';

  const enterpriseBrowserUrl = useMemo(() => {
    const base = webuiApiBase?.trim();
    if (!base) return '';
    return `${base.replace(/\/$/, '')}/#/enterprise`;
  }, [webuiApiBase]);

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

  const desktopFeatureItems = useMemo(
    () =>
      [
        {
          key: 'members',
          icon: <EveryUser theme='outline' size={18} />,
          label: t('settings.enterpriseConsole.desktopFeatureMembers', {
            defaultValue: '成员与团队',
          }),
          desc: t('settings.enterpriseConsole.desktopFeatureMembersDesc', {
            defaultValue: '账号、角色、团队与组织架构',
          }),
        },
        {
          key: 'auth',
          icon: <Mail theme='outline' size={18} />,
          label: t('settings.enterpriseConsole.desktopFeatureAuth', {
            defaultValue: '认证与邮件',
          }),
          desc: t('settings.enterpriseConsole.desktopFeatureAuthDesc', {
            defaultValue: 'LDAP、飞书 SSO、SMTP',
          }),
        },
        {
          key: 'invites',
          icon: <TicketOne theme='outline' size={18} />,
          label: t('settings.enterpriseConsole.desktopFeatureInvites', {
            defaultValue: '邀请与治理',
          }),
          desc: t('settings.enterpriseConsole.desktopFeatureInvitesDesc', {
            defaultValue: '邀请码、安全策略入口',
          }),
        },
      ] as const,
    [t]
  );

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
    if (status !== 'ready' || enterpriseModeLoading) return;
    if (!showEnterpriseConsoleNav) return;
    if (eligible && elevated) return;
    const item = ENTERPRISE_NAV_ITEMS.find((n) => n.key === activeNavKey);
    if (item?.requiresElevation) {
      void navigate(ENTERPRISE_USERS_PATH, { replace: true });
    }
  }, [
    activeNavKey,
    eligible,
    elevated,
    enterpriseModeLoading,
    navigate,
    showEnterpriseConsoleNav,
    status,
  ]);

  const handleNavClick = useCallback(
    (key: string) => {
      const item = ENTERPRISE_NAV_ITEMS.find((n) => n.key === key);
      if (!item) return;
      if (item.requiresElevation && !fullAccess) {
        Message.warning(t('settings.enterpriseAdmin.tabLocked', { defaultValue: '请先完成管理员二次验证' }));
        setElevateModalOpen(true);
        if (item.key !== 'users') {
          void navigate(ENTERPRISE_USERS_PATH);
        }
        return;
      }
      void navigate(item.path);
    },
    [fullAccess, navigate, t]
  );

  const submitElevate = useCallback(async () => {
    if (!showPasswordForm) {
      const hasLockedPasswordOnly =
        flatVerifyOptions.some((o) => o.kind === 'password' && o.locked) &&
        !flatVerifyOptions.some((o) => o.kind === 'password' && !o.locked);
      if (hasLockedPasswordOnly) {
        Message.warning(
          t('settings.enterpriseAdmin.elevateNeedsLocalPasswordOrBindLdap', {
            defaultValue:
              '当前无法用域密码验证：请为管理员账号保留或重置本地登录密码，或由管理员在用户管理中绑定 LDAP 身份后再操作。',
          })
        );
        return;
      }
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
      Message.warning(
        t('settings.enterpriseAdmin.oauthNotImplemented', { defaultValue: '该方式暂未接入，请改用密码验证。' })
      );
      return;
    }
    if (sel.locked && sel.lockedReason === 'ldap_not_bound') {
      Message.warning(
        t('settings.enterpriseAdmin.elevateLdapNeedsBindingToast', {
          defaultValue:
            '当前账号尚未绑定 LDAP/域账号。请在「用户与成员」中由管理员为该账号绑定域身份后再用域密码验证；本次请使用本地密码。',
        })
      );
      return;
    }
    if (sel.locked && sel.lockedReason === 'ldap_not_configured') {
      Message.warning(
        t('settings.enterpriseAdmin.elevateLdapNotConfiguredToast', {
          defaultValue:
            '尚未启用或未完整配置 LDAP。请先在「认证与邮件」中配置 LDAP 后再使用域账号验证。',
        })
      );
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
      Message.error(formatEnterpriseElevateError(e, t));
    } finally {
      setElevateSubmitting(false);
    }
  }, [
    elevatePassword,
    flatVerifyOptions,
    loadElevation,
    selectedVerifyOption,
    showPasswordForm,
    t,
    verifyChoiceId,
  ]);

  const primaryActionNeedsPassword =
    showPasswordForm &&
    selectedVerifyOption?.kind === 'password' &&
    !selectedVerifyOption.locked;

  const gateValue = useMemo(
    () => ({
      status,
      eligible,
      elevated,
      refetch: loadElevation,
    }),
    [status, eligible, elevated, loadElevation]
  );

  if (enterpriseModeLoading) {
    return (
      <div className='app-shell flex flex-col size-full min-h-0'>
        <Titlebar workspaceAvailable={false} />
        <div className='flex justify-center items-center flex-1 py-40px'>
          <Spin />
        </div>
      </div>
    );
  }

  if (!hasJoinedEnterprise) {
    return (
      <div className='app-shell flex flex-col size-full min-h-0 bg-1'>
        <Titlebar workspaceAvailable={false} />
        <div className='flex-1 overflow-y-auto'>
          <EnterpriseOnboarding />
        </div>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div className='app-shell flex flex-col size-full min-h-0'>
        <Titlebar workspaceAvailable={false} />
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
  }

  return (
    <EnterpriseGateProvider value={gateValue}>
      <div className='app-shell flex flex-col size-full min-h-0 bg-1'>
        <Titlebar workspaceAvailable={false} />
        <div className='flex flex-1 min-h-0'>
          <aside className={styles.sidebar}>
            <div className='px-16px pt-16px pb-12px border-b border-border-2'>
              <div className='text-15px font-700 text-t-primary mb-4px'>
                {t('settings.enterpriseConsole.title', { defaultValue: '企业控制台' })}
              </div>
              <Typography.Paragraph type='secondary' className='mb-0 text-12px truncate'>
                {tenantLabel}
              </Typography.Paragraph>
            </div>
            <Menu
              className='flex-1 border-0 bg-transparent'
              selectedKeys={[activeNavKey]}
              onClickMenuItem={(key) => handleNavClick(String(key))}
            >
              {ENTERPRISE_NAV_ITEMS.map((item) => (
                <Menu.Item key={item.key}>
                  <span className='flex items-center justify-between gap-8px'>
                    {t(item.labelKey, { defaultValue: item.labelDefault })}
                    {item.comingSoon ? (
                      <Tag size='small' color='gray'>
                        {t('settings.enterpriseConsole.navComingSoon', { defaultValue: '即将推出' })}
                      </Tag>
                    ) : null}
                  </span>
                </Menu.Item>
              ))}
            </Menu>
          </aside>
          <main className={styles.main}>
            <div className={styles.headerRow}>
              <div className='flex flex-wrap items-center gap-8px'>
                <Tag color='arcoblue'>{formatEnterpriseRole(user?.role, t)}</Tag>
                {user?.username ? <Tag>{user.username}</Tag> : null}
              </div>
              <div className='flex flex-wrap gap-8px'>
                <Button size='small' onClick={() => void navigate('/sessions')}>
                  {t('settings.enterpriseConsole.backToPersonal', { defaultValue: '返回个人工作台' })}
                </Button>
                <Button size='small' type='outline' onClick={() => void navigate('/settings/webui')}>
                  {t('settings.enterpriseConsole.goStandaloneWebui', { defaultValue: '单机 WebUI 设置' })}
                </Button>
                {fullAccess ? (
                  <Button
                    size='small'
                    onClick={() => {
                      void postEnterpriseElevateRevoke()
                        .then(() => {
                          setElevated(false);
                          Message.success(
                            t('settings.enterpriseAdmin.lockSuccess', { defaultValue: '已锁定管理会话' })
                          );
                          void navigate(ENTERPRISE_USERS_PATH);
                          void loadElevation();
                        })
                        .catch((e) => Message.error(e instanceof Error ? e.message : 'Failed'));
                    }}
                  >
                    {t('settings.enterpriseAdmin.lockSession', { defaultValue: '锁定管理会话' })}
                  </Button>
                ) : null}
              </div>
            </div>

            {eligible && !elevated ? (
              <Typography.Paragraph type='warning' className='mb-12px'>
                {t('settings.enterpriseAdmin.elevateHint', {
                  defaultValue: '请选择一种验证方式并完成后解锁全员管理与系统配置。',
                })}
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

            {status === 'loading' && location.pathname !== ENTERPRISE_HOME_PATH ? (
              <div className='flex justify-center py-40px'>
                <Spin />
              </div>
            ) : (
              <Outlet />
            )}
          </main>
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
            disabled: elevateSubmitting || (primaryActionNeedsPassword && !elevatePassword.trim()),
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
      </div>
    </EnterpriseGateProvider>
  );
};

export default EnterpriseLayout;
