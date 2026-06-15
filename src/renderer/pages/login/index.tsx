import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/renderer/services/i18n';
import { getEnterpriseRouteMetaByPath } from '@/common/auth/enterpriseRoutes';
import { resolvePostLoginRedirectPath, ENTERPRISE_JOIN_PATH } from '@/common/auth/enterpriseRoles';
import {
  consumePostLoginRedirect,
  peekPostLoginRedirect,
  readRedirectFromSearch,
} from '@/renderer/utils/postLoginRedirect';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { isElectronDesktop } from '@/renderer/utils/platform';
import heroIllustration from '@renderer/assets/login/enterprise-hero.svg';
import { useFeishuQrLogin } from '@/renderer/hooks/auth/useFeishuQrLogin';
import { formatOAuthAuthorizeError, startOAuthAuthorize } from '@/renderer/utils/oauthAuthorize';
import { useLoginUiProviders } from '@/renderer/hooks/auth/useLoginUiProviders';
import { useAuth } from '../../hooks/context/AuthContext';
import { syncBrowserWebuiSessionToDesktop } from '@/renderer/utils/syncBrowserWebuiSession';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { resolveLoginIntentFromSearch } from '@/renderer/utils/enterpriseLoginNavigation';
import '@/renderer/styles/enterprise-theme.css';
import LoginFormCard from './components/LoginFormCard';
import LoginHeroPanel from './components/LoginHeroPanel';
import './LoginPage.css';

type MessageState = {
  type: 'error' | 'success';
  text: string;
};

type FormMethod = 'local' | 'ldap';

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
  const loginReturnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const isDesktopApp = isElectronDesktop();
  const { status, login, loginWithLdap, user } = useAuth();
  const { loading: enterpriseLoading } = useWebuiEnterpriseMode();
  const providers = useLoginUiProviders();

  const resolveLoginTarget = useCallback(
    (loggedInUser?: { role?: string; tenant_id?: string }) => {
      const fromQuery = readRedirectFromSearch(location.search);
      let target = fromQuery ?? consumePostLoginRedirect();
      return resolvePostLoginRedirectPath(target, loggedInUser?.role, loggedInUser?.tenant_id, isElectronDesktop());
    },
    [location.search]
  );

  const navigateAfterLogin = useCallback(
    (loggedInUser?: { role?: string; tenant_id?: string }) => {
      void navigate(resolveLoginTarget(loggedInUser), { replace: true });
    },
    [navigate, resolveLoginTarget]
  );

  const handleBack = useCallback(() => {
    const target =
      loginReturnTo && loginReturnTo !== '/login' && !loginReturnTo.startsWith('/login?') ? loginReturnTo : '/sessions';
    void navigate(target, { replace: true });
  }, [loginReturnTo, navigate]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [formMethod, setFormMethod] = useState<FormMethod>(() => {
    try {
      const saved = window.sessionStorage.getItem('login:form-method');
      if (saved === 'local' || saved === 'ldap') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'local';
  });
  const isBrowserWebUi = !isElectronDesktop();

  const postLoginTarget = readRedirectFromSearch(location.search);
  const loginIntent = resolveLoginIntentFromSearch(location.search);
  const enterpriseLoginMode = loginIntent === 'enterprise-member';
  const adminLoginMode = loginIntent === 'webui-admin';
  const enterpriseIntent = useMemo(
    () =>
      !adminLoginMode &&
      (enterpriseLoginMode ||
        postLoginTarget === '/enterprise/join' ||
        postLoginTarget?.startsWith('/enterprise/join') ||
        postLoginTarget === '/enterprise' ||
        (postLoginTarget?.startsWith('/enterprise') ?? false)),
    [adminLoginMode, enterpriseLoginMode, postLoginTarget]
  );
  const isEnterpriseLogin =
    !adminLoginMode && (enterpriseLoginMode || enterpriseIntent || providers.mode === 'enterprise');
  const useEnterpriseChannelPanel = isDesktopApp && isEnterpriseLogin;
  const oauthRedirect = useMemo(() => {
    const fromQuery = readRedirectFromSearch(location.search);
    if (fromQuery) {
      return fromQuery;
    }
    if (loginReturnTo && loginReturnTo !== '/login') {
      return loginReturnTo;
    }
    return '/enterprise';
  }, [location.search, loginReturnTo]);
  const showLoginMethods = isEnterpriseLogin;
  const showEnterpriseExtras = isBrowserWebUi && enterpriseIntent;
  const pageEdition =
    providers.mode === 'enterprise' || enterpriseIntent || enterpriseLoginMode ? 'enterprise' : 'standalone';

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
    if (status === 'authenticated' && user && !enterpriseLoading) {
      if (isDesktopApp) {
        void syncBrowserWebuiSessionToDesktop().finally(() => {
          navigateAfterLogin(user ?? undefined);
          window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
        });
        return;
      }
      navigateAfterLogin(user ?? undefined);
    }
  }, [enterpriseLoading, isDesktopApp, navigateAfterLogin, status, user]);

  const handleFormMethodChange = useCallback((value: FormMethod) => {
    setFormMethod(value);
    setMessage(null);
    try {
      window.sessionStorage.setItem('login:form-method', value);
    } catch {
      // ignore
    }
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

      const activeMethod: FormMethod = isEnterpriseLogin ? formMethod : 'local';

      if (activeMethod === 'ldap' && !providers.ldapEnabled) {
        showMessage({
          type: 'error',
          text: t('login.errors.ldapNotEnabled', {
            defaultValue: 'LDAP 登录尚未启用，请组织管理员在企业控制台启用后再试，或改用本地账户登录。',
          }),
        });
        return;
      }

      setLoading(true);
      setMessage(null);

      const result =
        activeMethod === 'ldap'
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

        showMessage({ type: 'success', text: t('login.success') });
        navigateAfterLogin(result.user);
      } else {
        const errorText = (() => {
          switch (result.code) {
            case 'invalidCredentials':
              return activeMethod === 'ldap'
                ? t('login.errors.invalidLdapCredentials', {
                    defaultValue: '域控账户名或密码错误。请检查账号密码，或联系管理员确认 LDAP 已启用。',
                  })
                : t('login.errors.invalidCredentials');
            case 'tooManyAttempts':
              return t('login.errors.tooManyAttempts');
            case 'networkError':
              return t('login.errors.networkError');
            case 'serverError':
              return t('login.errors.serverError');
            case 'dbUnavailable':
              return t('login.errors.dbUnavailable', {
                defaultValue:
                  '本地数据库不可用。请关闭其他 1ONE 实例并重启应用；若仍失败，请删除损坏的数据库文件后重试。',
              });
            case 'unknown':
            default:
              return result.message ?? t('login.errors.unknown');
          }
        })();

        showMessage({ type: 'error', text: errorText });
      }

      setLoading(false);
    },
    [
      formMethod,
      isEnterpriseLogin,
      login,
      loginWithLdap,
      navigateAfterLogin,
      password,
      providers.ldapEnabled,
      rememberMe,
      showMessage,
      t,
      username,
    ]
  );

  const feishuRedirectTarget = useMemo(
    () => readRedirectFromSearch(location.search) ?? peekPostLoginRedirect(),
    [location.search]
  );

  const buildOAuthAuthorizePath = useCallback(
    (provider: 'feishu' | 'dingtalk' | 'wecom', mode: 'oauth' | 'qr' = 'oauth') => {
      const params = new URLSearchParams({ mode });
      if (feishuRedirectTarget) {
        params.set('redirect', feishuRedirectTarget);
      }
      return `/api/auth/${provider}/authorize?${params.toString()}`;
    },
    [feishuRedirectTarget]
  );

  const buildFeishuAuthorizePath = useCallback(
    (mode: 'oauth' | 'qr') => buildOAuthAuthorizePath('feishu', mode),
    [buildOAuthAuthorizePath]
  );

  const { showQr, setShowQr, initError } = useFeishuQrLogin(buildFeishuAuthorizePath);

  const runOAuthAuthorize = useCallback(
    async (path: string) => {
      const result = await startOAuthAuthorize(path);
      if (result.ok === false) {
        showMessage({
          type: 'error',
          text: formatOAuthAuthorizeError(result.message, t, result.code),
        });
      }
    },
    [showMessage, t]
  );

  const handleFeishuOauthClick = useCallback(() => {
    void runOAuthAuthorize(buildFeishuAuthorizePath('oauth'));
  }, [buildFeishuAuthorizePath, runOAuthAuthorize]);

  const handleDingtalkOauth = useCallback(() => {
    void runOAuthAuthorize(buildOAuthAuthorizePath('dingtalk'));
  }, [buildOAuthAuthorizePath, runOAuthAuthorize]);

  const handleWecomOauth = useCallback(() => {
    void runOAuthAuthorize(buildOAuthAuthorizePath('wecom'));
  }, [buildOAuthAuthorizePath, runOAuthAuthorize]);

  const methodHint = useMemo(() => {
    if (formMethod === 'ldap') {
      return t('login.methods.ldapHint', { defaultValue: '使用企业域控账户登录' });
    }
    return t('login.methods.localHint', { defaultValue: '使用系统本地账户登录' });
  }, [formMethod, t]);

  const loginUiLoadError =
    providers.error === 'db_unavailable' ? 'db_unavailable' : providers.error === 'load_failed' ? 'load_failed' : null;

  if (status === 'checking' || (isBrowserWebUi && providers.loading)) {
    return <AppLoader />;
  }

  const redirectRequiresSignIn =
    Boolean(postLoginTarget) && getEnterpriseRouteMetaByPath(postLoginTarget)?.requiresRole !== 'member';
  const redirectTargetsEnterpriseJoin =
    postLoginTarget === ENTERPRISE_JOIN_PATH || postLoginTarget?.startsWith(`${ENTERPRISE_JOIN_PATH}/`);
  if (isBrowserWebUi && redirectTargetsEnterpriseJoin && status === 'unauthenticated' && !redirectRequiresSignIn) {
    return <Navigate to={ENTERPRISE_JOIN_PATH} replace />;
  }

  const loginEdition: 'enterprise' | 'admin' | 'standalone' = adminLoginMode
    ? 'admin'
    : pageEdition === 'enterprise'
      ? 'enterprise'
      : 'standalone';

  const cardTitle =
    loginEdition === 'admin'
      ? t('login.admin.cardTitle', { defaultValue: '团队版管理员专属后台' })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.cardTitle', { defaultValue: '登录您的账户' })
        : t('login.standalone.cardTitle', { defaultValue: '登录 WebUI' });
  const cardSubtitle =
    loginEdition === 'admin'
      ? t('login.admin.cardSubtitle', {
          defaultValue: '使用「设置 → 远程连接 → WebUI」中的本地管理员账号登录',
        })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.cardSubtitle', { defaultValue: '管理您的会话与任务' })
        : t('login.standalone.cardSubtitle', {
            defaultValue: '用户名与密码见「设置 → 远程连接 → WebUI」',
          });
  const heroBadge =
    loginEdition === 'admin'
      ? t('login.admin.heroBadge', { defaultValue: '实例管理' })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.heroBadge', { defaultValue: '1ONE Code 企业版' })
        : t('login.standalone.heroBadge', { defaultValue: 'WEB 控制台' });
  const heroTitle =
    loginEdition === 'admin'
      ? t('login.admin.heroTitle', { defaultValue: '团队版管理员专属后台' })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.heroTitle', { defaultValue: '团队 AI 协作工作台' })
        : t('login.standalone.heroTitle', { defaultValue: 'WebUI 远程访问' });
  const heroDescription =
    loginEdition === 'admin'
      ? t('login.admin.brandDesc', {
          defaultValue: '使用本机 WebUI 管理员账户登录，配置认证、邀请码、租户与系统治理；与团队成员登录入口分离。',
        })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.brandDesc', {
            defaultValue: '面向团队的命令行与对话型 AI 体验，统一账号与权限，支持本地、域控与飞书等多种登录方式。',
          })
        : t('login.standalone.brandDesc', {
            defaultValue: '使用本机管理员账户登录，在手机或远程浏览器中管理 1ONE 会话与任务。',
          });
  const heroIntroTitle =
    loginEdition === 'admin'
      ? t('login.admin.introTitle', { defaultValue: '实例治理与认证配置' })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.introTitle', { defaultValue: '专注于企业团队 AI 协作' })
        : t('login.standalone.introTitle', { defaultValue: '专注于远程运维与会话掌控' });
  const heroIntroText =
    loginEdition === 'admin'
      ? t('login.admin.introText', {
          defaultValue:
            '面向系统管理员与组织管理员：管理 LDAP/飞书、成员邀请、企业团队版开关及后台模块，不面向普通员工日常使用。',
        })
      : loginEdition === 'enterprise'
        ? t('login.enterprise.introText', {
            defaultValue: '支持多租户管理、LDAP 域控集成、飞书/钉钉/企微 SSO，为企业团队提供安全、高效的 AI 工作体验。',
          })
        : t('login.standalone.introText', {
            defaultValue: '在浏览器中安全访问本机 1ONE，统一查看任务、会话和运行状态，适合移动办公与远程协作场景。',
          });
  const illustrationAlt = t('login.heroIllustrationAlt', {
    defaultValue: '企业 AI 工作台主视觉',
  });

  return (
    <div
      className={`login-page login-page--${loginEdition}${isBrowserWebUi ? ' login-page--web' : ' login-page--desktop'}${isDesktopApp ? ' login-page--desktop-app' : ''}`}
    >
      {!isDesktopApp ? (
        <LoginHeroPanel
          badge={heroBadge}
          title={heroTitle}
          description={heroDescription}
          introTitle={heroIntroTitle}
          introText={heroIntroText}
          illustrationSrc={heroIllustration}
          illustrationAlt={illustrationAlt}
          edition={pageEdition}
        />
      ) : null}

      <LoginFormCard
        t={t}
        language={i18n.language}
        supportedLanguages={supportedLanguages}
        onLanguageChange={handleLanguageChange}
        cardTitle={cardTitle}
        cardSubtitle={cardSubtitle}
        loginUiLoadError={loginUiLoadError}
        showProvidersDisabledHint={
          isEnterpriseLogin && providers.anyProviderConfigured && !providers.anyProviderEnabled
        }
        showEnterpriseRedirectHint={isBrowserWebUi && isEnterpriseLogin}
        isEnterpriseLogin={isEnterpriseLogin}
        isBrowserWebUi={isBrowserWebUi}
        showLoginMethods={showLoginMethods}
        showEnterpriseExtras={showEnterpriseExtras}
        formMethod={formMethod}
        onFormMethodChange={handleFormMethodChange}
        methodHint={methodHint}
        ldapEnabled={providers.ldapEnabled}
        ldapConfigured={providers.ldapConfigured}
        username={username}
        password={password}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        rememberMe={rememberMe}
        onRememberMeChange={setRememberMe}
        onSubmit={handleSubmit}
        loading={loading}
        showFeishuLogin={isBrowserWebUi && isEnterpriseLogin}
        feishuLoginEnabled={providers.feishuEnabled}
        showDingtalkLogin={isBrowserWebUi && isEnterpriseLogin}
        dingtalkLoginEnabled={providers.dingtalkEnabled}
        showWecomLogin={isBrowserWebUi && isEnterpriseLogin}
        wecomLoginEnabled={providers.wecomEnabled}
        onFeishuOauth={handleFeishuOauthClick}
        onDingtalkOauth={handleDingtalkOauth}
        onWecomOauth={handleWecomOauth}
        showFeishuQr={showQr}
        onToggleFeishuQr={() => {
          setMessage(null);
          setShowQr((value) => !value);
        }}
        feishuQrError={initError}
        message={message}
        showBackButton={isDesktopApp}
        onBack={handleBack}
        useEnterpriseChannelPanel={useEnterpriseChannelPanel}
        oauthRedirect={oauthRedirect}
      />
    </div>
  );
};

export default LoginPage;
