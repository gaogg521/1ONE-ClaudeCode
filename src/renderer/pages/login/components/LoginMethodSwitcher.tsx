import React from 'react';
import { Typography } from '@arco-design/web-react';
import { DataServer, HardDisk, Key } from '@icon-park/react';

type LoginMethod = 'local' | 'ldap';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type LoginMethodSwitcherProps = {
  value: LoginMethod;
  onChange: (value: LoginMethod) => void;
  ldapEnabled: boolean;
  ldapConfigured: boolean;
  methodHint: string;
  t: Translate;
};

const LoginMethodSwitcher: React.FC<LoginMethodSwitcherProps> = ({
  value,
  onChange,
  ldapEnabled,
  ldapConfigured,
  methodHint,
  t,
}) => {
  const options: Array<{
    id: LoginMethod;
    label: string;
    icon: React.ReactNode;
    disabled: boolean;
  }> = [
    {
      id: 'ldap',
      label: t('login.methods.ldap', { defaultValue: 'LDAP 域控' }),
      icon: <DataServer theme='outline' size='16' />,
      disabled: false,
    },
    {
      id: 'local',
      label: t('login.methods.local', { defaultValue: '本地账户' }),
      icon: <HardDisk theme='outline' size='16' />,
      disabled: false,
    },
  ];

  return (
    <div className='login-page__method-section'>
      <div className='login-page__method-section-head'>
        <span className='login-page__method-section-key' aria-hidden='true'>
          <Key theme='filled' size='16' fill='var(--login-accent)' />
        </span>
        <Typography.Text className='login-page__method-section-title'>
          {t('login.methods.sectionTitle', { defaultValue: '登录方式' })}
        </Typography.Text>
      </div>

      <div className='login-page__method-switcher-shell'>
        <div className='login-page__method-switcher' role='tablist' aria-label={t('login.methods.sectionTitle', { defaultValue: '登录方式' })}>
          {options.map((option) => (
            <button
              key={option.id}
              type='button'
              role='tab'
              aria-selected={value === option.id}
              disabled={option.disabled}
              className={`login-page__method-option${value === option.id ? ' is-active' : ''}${option.disabled ? ' is-disabled' : ''}`}
              onClick={() => {
                if (option.disabled) return;
                onChange(option.id);
              }}
            >
              <span className='login-page__method-option-icon' aria-hidden='true'>
                {option.icon}
              </span>
              <span className='login-page__method-option-label'>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Typography.Paragraph type='secondary' className='login-page__method-hint'>
        {methodHint}
      </Typography.Paragraph>

      {!ldapEnabled || !ldapConfigured ? (
        <Typography.Paragraph type='secondary' className='login-page__method-notice'>
          {!ldapConfigured
            ? t('login.methods.ldapNotConfiguredHint', {
                defaultValue: 'LDAP 尚未完成配置。请组织管理员先完成配置并启用后再使用域控登录。',
              })
            : t('login.methods.ldapDisabledHint', {
                defaultValue: 'LDAP 已在后台配置但尚未启用。请组织管理员启用后再使用域控登录。',
              })}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
};

export default LoginMethodSwitcher;
