import React, { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Select,
  Typography,
} from '@arco-design/web-react';
import { Lock, Send, Shield, User } from '@icon-park/react';
import loginLogo from '@renderer/assets/logos/brand/app.png';
import LoginMethodSwitcher from './LoginMethodSwitcher';

type SupportedLanguage = {
  code: string;
  label: string;
};

type MessageState = {
  type: 'error' | 'success';
  text: string;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

type LoginFormCardProps = {
  t: Translate;
  language: string;
  supportedLanguages: SupportedLanguage[];
  onLanguageChange: (value: string) => void;
  cardTitle: string;
  cardSubtitle: string;
  loginUiLoadError: 'db_unavailable' | 'load_failed' | null;
  showProvidersDisabledHint: boolean;
  showEnterpriseRedirectHint: boolean;
  isEnterpriseLogin: boolean;
  isBrowserWebUi: boolean;
  showLoginMethods: boolean;
  showEnterpriseExtras: boolean;
  formMethod: 'local' | 'ldap';
  onFormMethodChange: (value: 'local' | 'ldap') => void;
  methodHint: string;
  ldapEnabled: boolean;
  ldapConfigured: boolean;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  rememberMe: boolean;
  onRememberMeChange: (value: boolean) => void;
  onSubmit: (event: React.FormEvent) => void;
  loading: boolean;
  showFeishuLogin: boolean;
  feishuLoginEnabled: boolean;
  showDingtalkLogin: boolean;
  dingtalkLoginEnabled: boolean;
  showWecomLogin: boolean;
  wecomLoginEnabled: boolean;
  onFeishuOauth: () => void;
  onDingtalkOauth: () => void;
  onWecomOauth: () => void;
  showFeishuQr: boolean;
  onToggleFeishuQr: () => void;
  feishuQrError: string | null;
  message: MessageState | null;
  onContinueAsGuest: () => void;
  onJoinEnterprise: () => void;
};

const LoginFormCard: React.FC<LoginFormCardProps> = ({
  t,
  language,
  supportedLanguages,
  onLanguageChange,
  cardTitle,
  cardSubtitle,
  loginUiLoadError,
  showProvidersDisabledHint,
  showEnterpriseRedirectHint,
  isEnterpriseLogin,
  isBrowserWebUi,
  formMethod,
  onFormMethodChange,
  methodHint,
  ldapEnabled,
  ldapConfigured,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  rememberMe,
  onRememberMeChange,
  onSubmit,
  loading,
  showLoginMethods,
  showEnterpriseExtras,
  showFeishuLogin,
  feishuLoginEnabled,
  showDingtalkLogin,
  dingtalkLoginEnabled,
  showWecomLogin,
  wecomLoginEnabled,
  onFeishuOauth,
  onDingtalkOauth,
  onWecomOauth,
  showFeishuQr,
  onToggleFeishuQr,
  feishuQrError,
  message,
  onContinueAsGuest,
  onJoinEnterprise,
}) => {
  const [inviteExpanded, setInviteExpanded] = useState(false);
  const showOAuthSection = showFeishuLogin || showDingtalkLogin || showWecomLogin;

  return (
    <section className='login-page__panel'>
      <div className={`login-page__card${isEnterpriseLogin ? ' login-page__card--rich' : ''}`}>
        <div className='login-page__lang'>
          <Select
            value={language}
            onChange={onLanguageChange}
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
          {isEnterpriseLogin ? (
            <div className='login-page__card-shield' aria-hidden='true'>
              <Shield theme='filled' size={26} fill='#fff' />
            </div>
          ) : (
            <div className='login-page__card-icon-wrap' aria-hidden='true'>
              <img src={loginLogo} alt='' className='login-page__card-icon-img' />
            </div>
          )}
          <Typography.Title heading={5} className='login-page__card-title'>
            {cardTitle}
          </Typography.Title>
          <Typography.Paragraph type='secondary' className='login-page__card-sub'>
            {cardSubtitle}
          </Typography.Paragraph>
          {showEnterpriseRedirectHint ? (
            <Typography.Paragraph type='secondary' className='login-page__card-meta'>
              {t('login.enterpriseRedirectHint', {
                defaultValue: '登录成功后将进入 1ONE Code 企业版。您也可在登录后使用邀请码加入组织。',
              })}
            </Typography.Paragraph>
          ) : null}
        </div>

        {loginUiLoadError ? (
          <Alert
            className='mb-12px'
            type='error'
            content={
              loginUiLoadError === 'db_unavailable'
                ? t('login.errors.dbUnavailable', {
                    defaultValue:
                      '本地数据库不可用。请关闭其他 1ONE 实例并重启应用；若仍失败，请删除损坏的数据库文件后重试。',
                  })
                : t('login.errors.loginUiLoadFailed', {
                    defaultValue: '无法加载登录配置，请刷新页面或联系管理员。',
                  })
            }
          />
        ) : null}

        {showProvidersDisabledHint ? (
          <Typography.Paragraph type='secondary' className='login-page__card-notice mb-12px'>
            {t('login.providersDisabledHint', {
              defaultValue:
                '企业登录方式已在后台配置但未启用。请组织管理员在「企业控制台 → 认证与邮件」中启用 LDAP/飞书/钉钉/企业微信 后再使用。',
            })}
          </Typography.Paragraph>
        ) : null}

        {showLoginMethods ? (
          <LoginMethodSwitcher
            value={formMethod}
            onChange={onFormMethodChange}
            ldapEnabled={ldapEnabled}
            ldapConfigured={ldapConfigured}
            methodHint={methodHint}
            t={t}
          />
        ) : null}

        <form className='login-page__form' onSubmit={onSubmit}>
          <div className='login-page__form-item'>
            <Typography.Text className='login-page__label'>
              {isEnterpriseLogin
                ? t('login.accountName', { defaultValue: '账户名' })
                : t('login.username', { defaultValue: '用户名' })}
            </Typography.Text>
            <Input
              id='login-username-input'
              name='username'
              prefix={isEnterpriseLogin ? undefined : <User theme='outline' size='16' />}
              suffix={isEnterpriseLogin ? <User theme='outline' size='16' /> : undefined}
              placeholder={
                isEnterpriseLogin
                  ? t('login.accountNamePlaceholder', { defaultValue: '请输入您的账户名' })
                  : t('login.usernamePlaceholder', { defaultValue: '请输入用户名' })
              }
              autoComplete='username'
              value={username}
              onChange={onUsernameChange}
              size='large'
              className='login-page__input'
            />
          </div>

          <div className='login-page__form-item'>
            <Typography.Text className='login-page__label'>{t('login.password')}</Typography.Text>
            <Input.Password
              id='password'
              name='password'
              prefix={isEnterpriseLogin ? undefined : <Lock theme='outline' size='16' />}
              suffix={isEnterpriseLogin ? <Lock theme='outline' size='16' /> : undefined}
              placeholder={t('login.passwordPlaceholder', { defaultValue: '请输入您的密码' })}
              autoComplete='current-password'
              value={password}
              onChange={onPasswordChange}
              size='large'
              className='login-page__input'
            />
          </div>

          <Checkbox checked={rememberMe} onChange={onRememberMeChange} className='login-page__remember'>
            {t('login.rememberMe')}
          </Checkbox>

          <div
            role='alert'
            aria-live='polite'
            className={`login-page__message ${message ? 'login-page__message--visible' : ''} ${message ? (message.type === 'success' ? 'login-page__message--success' : 'login-page__message--error') : ''}`}
            hidden={!message}
          >
            {message?.text}
          </div>

          <Button type='primary' htmlType='submit' long size='large' loading={loading} className='login-page__submit-btn'>
            {loading ? t('login.submitting') : t('login.submit')}
          </Button>

          {showOAuthSection ? (
            <>
              <div className='login-page__oauth-divider'>
                <span>{t('login.orDivider', { defaultValue: '或' })}</span>
              </div>

              {showFeishuLogin ? (
                <Button
                  long
                  size='large'
                  htmlType='button'
                  className='login-page__oauth-btn mb-8px'
                  onClick={onFeishuOauth}
                  disabled={loading}
                >
                  <span className='login-page__oauth-btn-inner'>
                    <Send theme='filled' size={16} fill='var(--login-accent)' className='login-page__feishu-icon' />
                    <span>{t('login.methods.feishuOauth', { defaultValue: '使用飞书登录' })}</span>
                  </span>
                </Button>
              ) : null}

              {showFeishuLogin && feishuLoginEnabled ? (
                <>
                  <Button type='text' long htmlType='button' className='login-page__feishu-qr-toggle' onClick={onToggleFeishuQr}>
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

              {showDingtalkLogin ? (
                <Button
                  long
                  size='large'
                  htmlType='button'
                  className={`login-page__oauth-btn mb-8px${dingtalkLoginEnabled ? '' : ' login-page__oauth-btn--pending'}`}
                  onClick={onDingtalkOauth}
                  disabled={loading}
                >
                  <span className='login-page__oauth-btn-inner'>
                    <Send theme='filled' size={16} fill='var(--login-accent)' />
                    <span>{t('login.methods.dingtalkOauth', { defaultValue: '使用钉钉登录' })}</span>
                  </span>
                </Button>
              ) : null}

              {showWecomLogin ? (
                <Button
                  long
                  size='large'
                  htmlType='button'
                  className={`login-page__oauth-btn mb-8px${wecomLoginEnabled ? '' : ' login-page__oauth-btn--pending'}`}
                  onClick={onWecomOauth}
                  disabled={loading}
                >
                  <span className='login-page__oauth-btn-inner'>
                    <Send theme='filled' size={16} fill='var(--login-accent)' />
                    <span>{t('login.methods.wecomOauth', { defaultValue: '使用企业微信登录' })}</span>
                  </span>
                </Button>
              ) : null}
            </>
          ) : null}

          {feishuQrError ? (
            <Typography.Paragraph type='error' className='login-page__method-hint text-12px'>
              {t('login.methods.feishuQrError', { defaultValue: '飞书二维码初始化失败' })}
            </Typography.Paragraph>
          ) : null}

          {isBrowserWebUi && showEnterpriseExtras ? (
            <div className='login-page__invite-block'>
              <Button
                type='text'
                long
                htmlType='button'
                className='login-page__invite-toggle'
                onClick={() => setInviteExpanded((value) => !value)}
              >
                {inviteExpanded
                  ? t('login.inviteCollapse', { defaultValue: '收起邀请码说明' })
                  : t('login.inviteTitle', { defaultValue: '或使用邀请码加入' })}
              </Button>
              {inviteExpanded ? (
                <Typography.Paragraph type='secondary' className='login-page__invite-detail'>
                  {t('login.inviteCoexist', {
                    defaultValue:
                      '邀请码与企业账号登录可并存：先用上方任一方式登录（本地账户、LDAP、飞书等），登录成功后进入「企业」页输入邀请码即可加入。',
                  })}
                </Typography.Paragraph>
              ) : null}
            </div>
          ) : null}
        </form>

        {isBrowserWebUi && !isEnterpriseLogin ? (
          <div className='login-page__secondary-actions'>
            <Button type='text' long htmlType='button' onClick={onContinueAsGuest}>
              {t('login.continueAsGuest', { defaultValue: '继续以访客身份使用' })}
            </Button>
            <span className='login-page__secondary-divider' aria-hidden='true'>
              ·
            </span>
            <Button type='text' long htmlType='button' onClick={onJoinEnterprise}>
              {t('login.joinEnterprise', { defaultValue: '登录 / 加入团队' })}
            </Button>
          </div>
        ) : null}

        <div className='login-page__footer'>
          <div className='login-page__footer-content'>
            <span>{t('login.footerPrimary')}</span>
            <span className='login-page__footer-divider'>•</span>
            <span>{t('login.footerSecondary')}</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LoginFormCard;
