import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const loginMock = vi.hoisted(() => vi.fn());
const loginWithLdapMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const locationSearchMock = vi.hoisted(() => ({ current: '' }));
const locationStateMock = vi.hoisted(() => ({ current: null as { returnTo?: string } | null }));
const readRedirectFromSearchMock = vi.hoisted(() => vi.fn(() => null));
const isDesktopMock = vi.hoisted(() => ({ current: false }));
const loginUiProvidersMock = vi.hoisted(() => ({
  current: {
    loading: false,
    mode: 'standalone' as 'standalone' | 'enterprise',
    error: 'none' as const,
    ldapEnabled: false,
    feishuEnabled: false,
    dingtalkEnabled: false,
    wecomEnabled: false,
    ldapConfigured: false,
    feishuConfigured: false,
    dingtalkConfigured: false,
    wecomConfigured: false,
    anyProviderEnabled: false,
    anyProviderConfigured: false,
  },
}));

vi.mock('@renderer/assets/logos/brand/app.png', () => ({
  default: 'login-logo.png',
}));

vi.mock('@/renderer/assets/channel-logos/lark.svg', () => ({ default: 'feishu.svg' }));
vi.mock('@/renderer/assets/channel-logos/dingtalk.svg', () => ({ default: 'dingtalk.svg' }));
vi.mock('@/renderer/assets/channel-logos/wecom.svg', () => ({ default: 'wecom.svg' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; provider?: string }) => {
      if (options?.provider && options?.defaultValue) {
        return options.defaultValue.replace('{{provider}}', options.provider);
      }
      return options?.defaultValue || _key;
    },
    i18n: {
      language: 'zh-CN',
    },
  }),
}));

vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ search: locationSearchMock.current, state: locationStateMock.current }),
  Navigate: ({ to }: { to: string }) => <div data-testid='navigate' data-to={to} />,
}));

vi.mock('@/common/auth/enterpriseRoles', () => ({
  ENTERPRISE_JOIN_PATH: '/enterprise/join',
  resolvePostLoginRedirectPath: vi.fn(() => '/sessions'),
}));

vi.mock('@/renderer/utils/postLoginRedirect', () => ({
  consumePostLoginRedirect: vi.fn(() => null),
  peekPostLoginRedirect: vi.fn(() => '/sessions'),
  readRedirectFromSearch: readRedirectFromSearchMock,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => isDesktopMock.current),
}));

vi.mock('../../src/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    login: loginMock,
    loginWithLdap: loginWithLdapMock,
  }),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({
    loading: false,
  }),
}));

vi.mock('@/renderer/hooks/auth/useLoginUiProviders', () => ({
  useLoginUiProviders: () => loginUiProvidersMock.current,
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div>loading</div>,
}));

vi.mock('@icon-park/react', () => ({
  DataServer: () => <span />,
  HardDisk: () => <span />,
  Key: () => <span />,
  Left: () => <span />,
  Lock: () => <span />,
  Send: () => <span />,
  Shield: () => <span />,
  User: () => <span />,
}));

vi.mock('@/renderer/utils/oauthAuthorize', () => ({
  startOAuthAuthorize: vi.fn().mockResolvedValue({ ok: true }),
  formatOAuthAuthorizeError: (message: string) => message,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    onClick,
    htmlType,
    disabled,
  }: React.PropsWithChildren<{
    onClick?: () => void;
    htmlType?: 'button' | 'submit';
    disabled?: boolean;
  }>) => (
    <button type={htmlType || 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );

  const Checkbox = ({
    children,
    checked,
    onChange,
  }: React.PropsWithChildren<{
    checked?: boolean;
    onChange?: (value: boolean) => void;
  }>) => (
    <label>
      <input
        type='checkbox'
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      {children}
    </label>
  );

  const Input = ({
    id,
    name,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    name?: string;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={id}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );

  Input.Password = Input;

  const Radio = ({
    children,
    value,
    disabled,
  }: React.PropsWithChildren<{
    value?: string;
    disabled?: boolean;
  }>) => (
    <label>
      <input type='radio' value={value} disabled={disabled} />
      {children}
    </label>
  );

  Radio.Group = ({ children }: React.PropsWithChildren) => <div>{children}</div>;

  const Select = ({
    children,
    value,
    onChange,
  }: React.PropsWithChildren<{
    value?: string;
    onChange?: (value: string) => void;
  }>) => (
    <select value={value} onChange={(event) => onChange?.(event.target.value)}>
      {children}
    </select>
  );

  Select.Option = ({
    children,
    value,
  }: React.PropsWithChildren<{
    value: string;
  }>) => <option value={value}>{children}</option>;

  return {
    Alert: ({ content }: { content?: React.ReactNode }) => <div>{content}</div>,
    Button,
    Checkbox,
    Divider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Input,
    Message: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Radio,
    Select,
    Spin: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Title: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    },
  };
});

import LoginPage from '@/renderer/pages/login';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationSearchMock.current = '';
    isDesktopMock.current = false;
    readRedirectFromSearchMock.mockReturnValue(null);
    loginUiProvidersMock.current = {
      loading: false,
      mode: 'standalone',
      error: 'none',
      ldapEnabled: false,
      feishuEnabled: false,
      dingtalkEnabled: false,
      wecomEnabled: false,
      ldapConfigured: false,
      feishuConfigured: false,
      dingtalkConfigured: false,
      wecomConfigured: false,
      anyProviderEnabled: false,
      anyProviderConfigured: false,
    };
  });

  it('shows standalone WebUI login form without enterprise SSO on standalone web access', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录 WebUI')).toBeInTheDocument();
    });

    expect(screen.getByText('WebUI 远程访问')).toBeInTheDocument();
    expect(screen.getByText('用户名与密码见「设置 → 远程连接 → WebUI」')).toBeInTheDocument();
    expect(screen.queryByText('登录方式')).not.toBeInTheDocument();
    expect(screen.queryByText('使用飞书登录')).not.toBeInTheDocument();
    expect(screen.queryByText('使用钉钉登录')).not.toBeInTheDocument();
    expect(screen.queryByText('使用企业微信登录')).not.toBeInTheDocument();
    expect(
      screen.queryByText('登录成功后将进入 1ONE Code 企业版。您也可在登录后使用邀请码加入组织。')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续以访客身份使用' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登录 / 加入团队' })).not.toBeInTheDocument();
  });

  it('shows SSO channel tiles on desktop enterprise login', async () => {
    isDesktopMock.current = true;
    loginUiProvidersMock.current = {
      ...loginUiProvidersMock.current,
      mode: 'enterprise',
      feishuEnabled: true,
      feishuConfigured: true,
      dingtalkEnabled: true,
      dingtalkConfigured: true,
      wecomEnabled: true,
      wecomConfigured: true,
      anyProviderEnabled: true,
      anyProviderConfigured: true,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('飞书')).toBeInTheDocument();
      expect(screen.getByText('钉钉')).toBeInTheDocument();
      expect(screen.getByText('企业微信')).toBeInTheDocument();
    });

    expect(screen.queryByText('登录方式')).not.toBeInTheDocument();
  });

  it('shows compact desktop login with back navigation', async () => {
    isDesktopMock.current = true;
    locationStateMock.current = { returnTo: '/sessions' };

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录 WebUI')).toBeInTheDocument();
    });

    expect(screen.queryByText('WebUI 远程访问')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions', { replace: true });
  });

  it('shows enterprise login methods when enterprise mode is enabled', async () => {
    loginUiProvidersMock.current = {
      ...loginUiProvidersMock.current,
      mode: 'enterprise',
      ldapEnabled: true,
      ldapConfigured: true,
      dingtalkEnabled: true,
      wecomEnabled: true,
      dingtalkConfigured: true,
      wecomConfigured: true,
      anyProviderEnabled: true,
      anyProviderConfigured: true,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录您的账户')).toBeInTheDocument();
    });

    expect(screen.getByText('登录方式')).toBeInTheDocument();
    expect(screen.getByText('使用钉钉登录')).toBeInTheDocument();
    expect(screen.getByText('使用企业微信登录')).toBeInTheDocument();
  });

  it('shows DingTalk and WeCom quick login buttons on web login', async () => {
    loginUiProvidersMock.current = {
      ...loginUiProvidersMock.current,
      mode: 'enterprise',
      dingtalkEnabled: true,
      wecomEnabled: true,
      dingtalkConfigured: true,
      wecomConfigured: true,
      anyProviderEnabled: true,
      anyProviderConfigured: true,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录您的账户')).toBeInTheDocument();
    });

    expect(screen.getByText('1ONE Code 企业版')).toBeInTheDocument();
    expect(screen.getByText('使用钉钉登录')).toBeInTheDocument();
    expect(screen.getByText('使用企业微信登录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login.submit' })).toBeInTheDocument();
  });

  it('redirects enterprise join intent to join page', async () => {
    locationSearchMock.current = '?redirect=%2Fenterprise%2Fjoin';
    readRedirectFromSearchMock.mockReturnValue('/enterprise/join');

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/enterprise/join');
    });
  });

  it('shows enterprise login page for explicit enterprise redirect intent', async () => {
    locationSearchMock.current = '?redirect=%2Fenterprise';
    readRedirectFromSearchMock.mockReturnValue('/enterprise');

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录您的账户')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    expect(screen.getByText('登录方式')).toBeInTheDocument();
  });

  it('shows login method section for enterprise mode even without LDAP configured', async () => {
    loginUiProvidersMock.current = {
      ...loginUiProvidersMock.current,
      mode: 'enterprise',
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录方式')).toBeInTheDocument();
    });

    expect(screen.getByText('本地账户')).toBeInTheDocument();
  });

  it('shows richer method descriptions for enterprise login options', async () => {
    loginUiProvidersMock.current = {
      ...loginUiProvidersMock.current,
      mode: 'enterprise',
      ldapEnabled: true,
      feishuEnabled: true,
      ldapConfigured: true,
      feishuConfigured: true,
      anyProviderEnabled: true,
      anyProviderConfigured: true,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录方式')).toBeInTheDocument();
    });

    expect(screen.getByText('使用系统本地账户登录')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'LDAP 域控' }));
    expect(screen.getByText('使用企业域控账户登录')).toBeInTheDocument();
    expect(screen.getByText('或')).toBeInTheDocument();
  });
});
