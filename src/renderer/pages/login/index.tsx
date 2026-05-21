import loginLogo from '@renderer/assets/logos/brand/app.png';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/renderer/services/i18n';
import { resolvePostLoginRedirectPath } from '@/common/auth/enterpriseRoles';
import { consumePostLoginRedirect, readRedirectFromSearch } from '@/renderer/utils/postLoginRedirect';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Input,
  Message,
  Radio,
  Select,
  Typography,
} from '@arco-design/web-react';
import { Lock, User } from '@icon-park/react';
import AppLoader from '@renderer/components/layout/AppLoader';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useAuth } from '../../hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import './LoginPage.css';

type MessageState = {
  type: 'error' | 'success';
  text: string;
};

type FormMethod = 'local' | 'ldap';

type FeishuQrLoginObj = {
  matchOrigin?: (origin: string) => boolean;
  matchData?: (data: unknown) => boolean;
};

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
const REMEMBERED_PASSWORD_KEY = 'rememberedPassword';

const obfuscate = (text: string): string => {
  const encoded = btoa(encodeURIComponent(text));
  return encoded.split('').toReversed().join('');
};

const deobfuscate = (text: string): string => {
  try {
    const reversed = text.split('').toReversed().join('');
    return decodeURIComponent(atob(reversed));
  } catch {
    return '';
  }
};

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, login, loginWithLdap, user } = useAuth();
  const { loading: enterpriseLoading } = useWebuiEnterpriseMode();

  const resolveLoginTarget = useCallback(
    (loggedInUser?: { role?: string; tenant_id?: string }) => {
      const fromQuery = readRedirectFromSearch(location.search);
      let target = fromQuery ?? consumePostLoginRedirect();
      return resolvePostLoginRedirectPath(target, loggedInUser?.role, loggedInUser?.tenant_id);
    },
    [location.search]
  );

  const navigateAfterLogin = useCallback(
    (loggedInUser?: { role?: string; tenant_id?: string }) => {
      void navigate(resolveLoginTarget(loggedInUser), { replace: true });
    },
    [navigate, resolveLoginTarget]
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginUiMode, setLoginUiMode] = useState<'loading' | 'standalone' | 'enterprise'>('loading');
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [dingtalkEnabled, setDingtalkEnabled] = useState(false);
  const [wecomEnabled, setWecomEnabled] = useState(false);
  const [ldapConfigured, setLdapConfigured] = useState(false);
  const [feishuConfigured, setFeishuConfigured] = useState(false);
  const [dingtalkConfigured, setDingtalkConfigured] = useState(false);
  const [wecomConfigured, setWecomConfigured] = useState(false);
  const [formMethod, setFormMethod] = useState<FormMethod>('local');
  const [showFeishuQr, setShowFeishuQr] = useState(false);
  const isBrowserWebUi = !isElectronDesktop();

  const [feishuQr, setFeishuQr] = useState<{ sdkUrl: string; goto: string } | null>(null);
  const feishuListenerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const messageTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    document.title = t('login.pageTitle');
  }, [t]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const isRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    if (isRememberMe) {
      const storedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      const storedPassword = localStorage.getItem(REMEMBERED_PASSWORD_KEY);
      if (storedUsername) setUsername(deobfuscate(storedUsername));
      if (storedPassword) setPassword(deobfuscate(storedPassword));
      setRememberMe(true);
    }
    window.setTimeout(() => {
      document.getElementById('login-username-input')?.focus();
    }, 0);

    return () => {
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && !enterpriseLoading) {
      navigateAfterLogin(user ?? undefined);
    }
  }, [enterpriseLoading, navigateAfterLogin, status, user]);

  useEffect(() => {
    let cancelled = false;
    const loadLoginUi = async () => {
      try {
        const res = await fetch('/api/auth/login-ui', { credentials: 'include' });
        const body = (await res.json()) as {
          success?: boolean;
          data?: {
            mode?: 'standalone' | 'enterprise';
            ldapEnabled?: boolean;
            feishuEnabled?: boolean;
            dingtalkEnabled?: boolean;
            wecomEnabled?: boolean;
            ldapConfigured?: boolean;
            feishuConfigured?: boolean;
            dingtalkConfigured?: boolean;
            wecomConfigured?: boolean;
          };
        };
        if (!cancelled) {
          const data = body?.success ? body.data : undefined;
          const ldapOn = Boolean(data?.ldapEnabled);
          const feishuOn = Boolean(data?.feishuEnabled);
          const dingtalkOn = Boolean(data?.dingtalkEnabled);
          const wecomOn = Boolean(data?.wecomEnabled);
          setLdapEnabled(ldapOn);
          setFeishuEnabled(feishuOn);
          setDingtalkEnabled(dingtalkOn);
          setWecomEnabled(wecomOn);
          setLdapConfigured(Boolean(data?.ldapConfigured));
          setFeishuConfigured(Boolean(data?.feishuConfigured));
          setDingtalkConfigured(Boolean(data?.dingtalkConfigured));
          setWecomConfigured(Boolean(data?.wecomConfigured));
          const mode =
            data?.mode === 'enterprise' || ldapOn || feishuOn || dingtalkOn || wecomOn
              ? 'enterprise'
              : 'standalone';
          setLoginUiMode(mode);
          if (ldapOn) {
            setFormMethod('ldap');
          }
        }
      } catch {
        if (!cancelled) {
          setLoginUiMode('standalone');
        }
      }
    };
    void loadLoginUi();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearMessageLater = useCallback(() => {
    if (messageTimer.current) {
      window.clearTimeout(messageTimer.current);
    }
    messageTimer.current = window.setTimeout(() => {
      setMessage((prev) => (prev?.type === 'success' ? prev : null));
    }, 5000);
  }, []);

  const showMessage = useCallback(
    (next: MessageState) => {
      setMessage(next);
      if (next.type === 'error') {
        clearMessageLater();
      }
    },
    [clearMessageLater]
  );

  const supportedLanguages = useMemo<{ code: string; label: string }[]>(
    () => [
      { code: 'zh-CN', label: '简体中文' },
      { code: 'zh-TW', label: '繁體中文' },
      { code: 'ja-JP', label: '日本語' },
      { code: 'ko-KR', label: '한국어' },
      { code: 'tr-TR', label: 'Türkçe' },
      { code: 'en-US', label: 'English' },
    ],
    []
  );

  const handleLanguageChange = useCallback((value: string) => {
    changeLanguage(value).catch((error: Error) => {
      console.error('Failed to change language:', error);
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedUsername = username.trim();

      if (!trimmedUsername || !password) {
        showMessage({ type: 'error', text: t('login.errors.empty') });
        return;
      }

      setLoading(true);
      setMessage(null);

      const result =
        formMethod === 'ldap'
          ? await loginWithLdap({ username: trimmedUsername, password, remember: rememberMe })
          : await login({ username: trimmedUsername, password, remember: rememberMe });

      if (result.success) {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_ME_KEY, 'true');
          localStorage.setItem(REMEMBERED_USERNAME_KEY, obfuscate(trimmedUsername));
          localStorage.setItem(REMEMBERED_PASSWORD_KEY, obfuscate(password));
        } else {
          localStorage.removeItem(REMEMBER_ME_KEY);
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
          localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
        }

        const successText = t('login.success');
        showMessage({ type: 'success', text: successText });

        window.setTimeout(() => {
          navigateAfterLogin(result.user);
        }, 600);
      } else {
        const errorText = (() => {
          switch (result.code) {
            case 'invalidCredentials':
              return t('login.errors.invalidCredentials');
            case 'tooManyAttempts':
              return t('login.errors.tooManyAttempts');
            case 'networkError':
              return t('login.errors.networkError');
            case 'serverError':
              return t('login.errors.serverError');
            case 'unknown':
            default:
              return result.message ?? t('login.errors.unknown');
          }
        })();

        showMessage({ type: 'error', text: errorText });
      }

      setLoading(false);
    },
    [formMethod, login, loginWithLdap, navigateAfterLogin, password, rememberMe, showMessage, t, username]
  );

  const handleFeishuOauth = useCallback(() => {
    window.location.href = '/api/auth/feishu/authorize?mode=oauth';
  }, []);

  const handleOauthPending = useCallback(
    (provider: 'dingtalk' | 'wecom') => {
      Message.info(
        t('login.methods.oauthPending', {
          defaultValue:
            '{{provider}} 登录回调正在接入。请先用 LDAP/飞书/本地账户登录，或使用邀请码加入；配置可在企业控制台 → 认证与邮件 中保存。',
          provider:
            provider === 'dingtalk'
              ? t('login.methods.dingtalk', { defaultValue: '钉钉' })
              : t('login.methods.wecom', { defaultValue: '企业微信' }),
        })
      );
    },
    [t]
  );

  const ensureScriptLoaded = useCallback(async (src: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const existing = document.querySelector(`script[data-one-feishu-qr="1"][src="${src}"]`);
    if (existing) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.oneFeishuQr = '1';
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('Failed to load Feishu QR SDK')), { once: true });
      document.head.appendChild(script);
    });
  }, []);

  const initFeishuQr = useCallback(async () => {
    setMessage(null);
    setFeishuQr(null);
    try {
      const res = await fetch('/api/auth/feishu/authorize?mode=qr', { credentials: 'include' });
      const raw = (await res.json().catch((): null => null)) as unknown;
      const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
      const data = obj?.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null;
      if (!res.ok || obj?.success !== true || !data?.goto || !data?.sdkUrl) {
        throw new Error((obj?.message as string) ?? 'Failed to init Feishu QR');
      }

      const sdkUrl = String(data.sdkUrl);
      const goto = String(data.goto);
      await ensureScriptLoaded(sdkUrl);

      setFeishuQr({ sdkUrl, goto });
    } catch (error) {
      console.error('Failed to init Feishu QR:', error);
      showMessage({ type: 'error', text: t('login.methods.feishuQrError', { defaultValue: '飞书二维码初始化失败' }) });
    }
  }, [ensureScriptLoaded, showMessage, t]);

  useEffect(() => {
    if (!showFeishuQr) {
      setFeishuQr(null);
      if (feishuListenerRef.current) {
        window.removeEventListener('message', feishuListenerRef.current);
        feishuListenerRef.current = null;
      }
      return;
    }
    void initFeishuQr();
    return () => {
      if (feishuListenerRef.current) {
        window.removeEventListener('message', feishuListenerRef.current);
        feishuListenerRef.current = null;
      }
    };
  }, [initFeishuQr, showFeishuQr]);

  useEffect(() => {
    if (!showFeishuQr || !feishuQr?.goto) return;
    const QRLogin = (window as unknown as { QRLogin?: (opts: unknown) => unknown }).QRLogin;
    if (!QRLogin) return;

    const containerId = 'one-feishu-qr-container';
    const obj = QRLogin({
      id: containerId,
      goto: feishuQr.goto,
      width: '260',
      height: '300',
      style: 'width:260px;height:300px;margin:0 auto;',
    }) as FeishuQrLoginObj;

    const handler = (event: MessageEvent) => {
      try {
        if (obj?.matchOrigin?.(event.origin) && obj?.matchData?.(event.data)) {
          const d = event.data as unknown;
          const tmpCode =
            d && typeof d === 'object' && 'tmp_code' in (d as Record<string, unknown>)
              ? (d as Record<string, unknown>).tmp_code
              : null;
          if (tmpCode) {
            window.location.href = `${feishuQr.goto}&tmp_code=${encodeURIComponent(String(tmpCode))}`;
          }
        }
      } catch {}
    };
    feishuListenerRef.current = handler;
    window.addEventListener('message', handler);

    return () => {
      window.removeEventListener('message', handler);
      feishuListenerRef.current = null;
    };
  }, [feishuQr, showFeishuQr]);

  const methodHint = useMemo(() => {
    if (formMethod === 'ldap') {
      return t('login.methods.ldapHint', { defaultValue: '使用企业域控账户登录' });
    }
    return t('login.methods.localHint', { defaultValue: '使用本地管理员账户登录' });
  }, [formMethod, t]);

  const postLoginTarget = readRedirectFromSearch(location.search);
  const enterpriseIntent =
    postLoginTarget === '/enterprise/join' ||
    postLoginTarget?.startsWith('/enterprise/join') ||
    postLoginTarget === '/enterprise' ||
    (postLoginTarget?.startsWith('/enterprise') ?? false);
  const isEnterpriseLogin = isBrowserWebUi && (loginUiMode === 'enterprise' || enterpriseIntent);
  const showLdapOption = ldapEnabled;
  const showFeishuLogin = feishuEnabled;
  const showDingtalkLogin = dingtalkEnabled;
  const showWecomLogin = wecomEnabled;
  const anyOauthLogin = showFeishuLogin || showDingtalkLogin || showWecomLogin;
  const anyProviderConfigured =
    ldapConfigured || feishuConfigured || dingtalkConfigured || wecomConfigured;
  const anyProviderEnabled = ldapEnabled || feishuEnabled || dingtalkEnabled || wecomEnabled;

  if (status === 'checking' || loginUiMode === 'loading') {
    return <AppLoader />;
  }

  const cardTitle = isEnterpriseLogin
    ? t('login.enterprise.cardTitle', { defaultValue: '登录您的账户' })
    : t('login.standalone.cardTitle', { defaultValue: '登录 WebUI' });
  const cardSubtitle = isEnterpriseLogin
    ? t('login.enterprise.cardSubtitle', { defaultValue: '管理您的会话与任务' })
    : t('login.standalone.cardSubtitle', {
        defaultValue: '用户名与密码见「设置 → 远程连接 → WebUI」',
      });

  return (
    <div className={`login-page${loginUiMode === 'enterprise' ? ' login-page--enterprise' : ''}`}>
      {isEnterpriseLogin ? (
        <div className='login-page__brand' aria-hidden={false}>
        <div className='login-page__brand-tag'>{t('login.enterprise.tag', { defaultValue: '1ONE' })}</div>
        <Typography.Title heading={4} className='login-page__brand-title'>
          {t('login.enterprise.heroTitle', { defaultValue: '企业级 AI 工作台' })}
        </Typography.Title>
        <Typography.Paragraph className='login-page__brand-desc'>
          {t('login.enterprise.brandDesc', {
            defaultValue:
              '面向团队的命令行与对话型 AI 体验，统一账号与权限，支持本地、域控与飞书等多种登录方式。',
          })}
        </Typography.Paragraph>
        <div className='login-page__brand-visual' aria-hidden='true' />
        </div>
      ) : null}

      <div className='login-page__panel'>
        <div className='login-page__card'>
          <div className='login-page__lang'>
            <Select
              value={i18n.language}
              onChange={handleLanguageChange}
              size='small'
              className='login-page__lang-select'
              triggerProps={{ autoAlignPopupWidth: false }}
            >
              {supportedLanguages.map((lang) => (
                <Select.Option key={lang.code} value={lang.code}>
                  {lang.label}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className='login-page__card-head'>
            <div className='login-page__card-icon-wrap' aria-hidden='true'>
              <img src={loginLogo} alt='' className='login-page__card-icon-img' />
            </div>
            <Typography.Title heading={5} className='login-page__card-title'>
              {cardTitle}
            </Typography.Title>
            <Typography.Paragraph type='secondary' className='login-page__card-sub'>
              {cardSubtitle}
            </Typography.Paragraph>
          </div>

          {isBrowserWebUi && anyProviderConfigured && !anyProviderEnabled ? (
            <Typography.Paragraph type='secondary' className='login-page__method-hint mb-12px'>
              {t('login.providersDisabledHint', {
                defaultValue:
                  '企业登录方式已在后台配置但未启用。请组织管理员在「企业控制台 → 认证与邮件」中启用 LDAP/飞书/钉钉/企业微信 后再使用。',
              })}
            </Typography.Paragraph>
          ) : null}

          {isEnterpriseLogin && enterpriseIntent ? (
            <Alert
              className='mb-12px'
              type='info'
              content={t('login.enterpriseRedirectHint', {
                defaultValue: '登录成功后将进入企业版（成员、团队、邀请码等）。您也可在登录后使用邀请码加入组织。',
              })}
            />
          ) : null}

          {isEnterpriseLogin ? (
            <>
              {showLdapOption ? (
                <Radio.Group
                  className='login-page__method-group'
                  type='button'
                  value={formMethod}
                  onChange={(v) => setFormMethod(v as FormMethod)}
                >
                  <Radio value='ldap'>{t('login.methods.ldap')}</Radio>
                  <Radio value='local'>{t('login.methods.local')}</Radio>
                </Radio.Group>
              ) : null}
              <Typography.Paragraph type='secondary' className='login-page__method-hint'>
                {methodHint}
              </Typography.Paragraph>
            </>
          ) : null}

          <form className='login-page__form' onSubmit={handleSubmit}>
            <div className='login-page__form-item'>
              <Typography.Text className='login-page__label'>{t('login.username')}</Typography.Text>
              <Input
                id='login-username-input'
                name='username'
                prefix={<User theme='outline' size='16' />}
                placeholder={t('login.usernamePlaceholder')}
                autoComplete='username'
                value={username}
                onChange={setUsername}
                size='large'
              />
            </div>

            <div className='login-page__form-item'>
              <Typography.Text className='login-page__label'>{t('login.password')}</Typography.Text>
              <Input.Password
                id='password'
                name='password'
                prefix={<Lock theme='outline' size='16' />}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete='current-password'
                value={password}
                onChange={setPassword}
                size='large'
              />
            </div>

            <Checkbox checked={rememberMe} onChange={setRememberMe} className='login-page__remember'>
              {t('login.rememberMe')}
            </Checkbox>

            <Button type='primary' htmlType='submit' long size='large' loading={loading} className='login-page__submit-btn'>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>

            {isEnterpriseLogin && anyOauthLogin ? (
              <>
                <Divider className='login-page__divider'>
                  {t('login.orDivider', { defaultValue: '或' })}
                </Divider>

                {showFeishuLogin ? (
                  <Button
                    long
                    size='large'
                    className='login-page__feishu-oauth mb-8px'
                    onClick={handleFeishuOauth}
                    disabled={loading}
                  >
                    {t('login.methods.feishuOauth', { defaultValue: '使用飞书登录' })}
                  </Button>
                ) : null}

                {showDingtalkLogin ? (
                  <Button
                    long
                    size='large'
                    className='mb-8px'
                    onClick={() => handleOauthPending('dingtalk')}
                    disabled={loading}
                  >
                    {t('login.methods.dingtalkOauth', { defaultValue: '使用钉钉登录' })}
                  </Button>
                ) : null}

                {showWecomLogin ? (
                  <Button
                    long
                    size='large'
                    className='mb-8px'
                    onClick={() => handleOauthPending('wecom')}
                    disabled={loading}
                  >
                    {t('login.methods.wecomOauth', { defaultValue: '使用企业微信登录' })}
                  </Button>
                ) : null}

                {showFeishuLogin ? (
                  <>
                    <Button
                      type='text'
                      long
                      className='login-page__feishu-qr-toggle'
                      onClick={() => setShowFeishuQr((v) => !v)}
                    >
                      {showFeishuQr
                        ? t('login.hideFeishuQr', { defaultValue: '收起飞书扫码' })
                        : t('login.showFeishuQr', { defaultValue: '显示飞书扫码登录' })}
                    </Button>

                    {showFeishuQr ? (
                      <div className='login-page__feishu-qr'>
                        <div className='login-page__feishu-qr-title'>
                          {t('login.methods.feishuQrTitle', { defaultValue: '或使用飞书扫码登录' })}
                        </div>
                        <div id='one-feishu-qr-container' className='login-page__feishu-qr-container' />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {isBrowserWebUi && isEnterpriseLogin ? (
              <div className='login-page__invite-hint mt-16px p-12px rd-8px border border-border-2 bg-fill-2'>
                <Typography.Text className='text-13px font-500 text-t-primary'>
                  {t('login.inviteTitle', { defaultValue: '或使用邀请码加入' })}
                </Typography.Text>
                <Typography.Paragraph type='secondary' className='text-12px mb-0 mt-4px'>
                  {t('login.inviteCoexist', {
                    defaultValue:
                      '邀请码与企业账号登录可并存：先用上方任一方式登录（本地账户、LDAP、飞书等），登录成功后进入「企业」页输入邀请码即可加入；无需重复注册。',
                  })}
                </Typography.Paragraph>
              </div>
            ) : null}

            <div
              role='alert'
              aria-live='polite'
              className={`login-page__message ${message ? 'login-page__message--visible' : ''} ${message ? (message.type === 'success' ? 'login-page__message--success' : 'login-page__message--error') : ''}`}
              hidden={!message}
            >
              {message?.text}
            </div>
          </form>

          <div className='login-page__footer'>
            <div className='login-page__footer-content'>
              <span>{t('login.footerPrimary')}</span>
              <span className='login-page__footer-divider'>•</span>
              <span>{t('login.footerSecondary')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
