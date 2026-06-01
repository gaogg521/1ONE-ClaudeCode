import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.hoisted(() => vi.fn());
const loginWithLdapMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  status: 'unauthenticated' as 'checking' | 'authenticated' | 'unauthenticated',
  user: null as { id: string; username: string; tenant_id?: string } | null,
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({
    hasJoinedEnterprise: false,
  }),
}));

vi.mock('@/renderer/hooks/auth/useLoginUiProviders', () => ({
  useLoginUiProviders: () => ({
    loading: false,
    error: 'none' as const,
    ldapEnabled: true,
    feishuEnabled: true,
    dingtalkEnabled: false,
    wecomEnabled: false,
    ldapConfigured: true,
    feishuConfigured: true,
    dingtalkConfigured: false,
    wecomConfigured: false,
    anyProviderEnabled: true,
    anyProviderConfigured: true,
    refresh: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; username?: string; method?: string }) => {
      if (options?.username && options?.defaultValue) {
        return options.defaultValue.replace('{{username}}', options.username);
      }
      if (options?.method && options?.defaultValue) {
        return options.defaultValue.replace('{{method}}', options.method);
      }
      return options?.defaultValue || key;
    },
  }),
}));

const refreshAuthMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    status: authState.status,
    user: authState.user,
    login: loginMock,
    loginWithLdap: loginWithLdapMock,
    logout: logoutMock,
    refresh: refreshAuthMock,
  }),
  isDesktopOperatorUser: (user: { id?: string } | null) => user?.id === 'desktop-local-admin',
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => false),
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/oauthAuthorize', () => ({
  startOAuthAuthorize: vi.fn().mockResolvedValue({ ok: true }),
  formatOAuthAuthorizeError: (message: string) => message,
}));

vi.mock('@/renderer/hooks/auth/useFeishuQrLogin', () => ({
  useFeishuQrLogin: () => ({
    handleFeishuOauth: vi.fn(),
  }),
}));

vi.mock('@/renderer/assets/channel-logos/lark.svg', () => ({ default: 'feishu.svg' }));
vi.mock('@/renderer/assets/channel-logos/dingtalk.svg', () => ({ default: 'dingtalk.svg' }));
vi.mock('@/renderer/assets/channel-logos/wecom.svg', () => ({ default: 'wecom.svg' }));

vi.mock('@icon-park/react', () => ({
  CheckOne: () => <span />,
  DataServer: () => <span />,
  HardDisk: () => <span />,
  Right: () => <span />,
  User: () => <span />,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    onClick,
    htmlType,
    loading,
  }: React.PropsWithChildren<{
    onClick?: () => void;
    htmlType?: 'button' | 'submit';
    loading?: boolean;
  }>) => (
    <button type={htmlType || 'button'} onClick={onClick} disabled={loading}>
      {children}
    </button>
  );

  const Input = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
  );
  Input.Password = Input;

  return {
    Alert: ({ content }: { content?: React.ReactNode }) => <div>{content}</div>,
    Button,
    Input,
    Message: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
    Spin: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Typography: {
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    },
  };
});

import { Message } from '@arco-design/web-react';
import { startOAuthAuthorize } from '@/renderer/utils/oauthAuthorize';
import EnterpriseLoginChannelPanel from '@/renderer/pages/enterprise/components/EnterpriseLoginChannelPanel';

describe('EnterpriseLoginChannelPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'unauthenticated';
    authState.user = null;
  });

  it('renders login channels without admin configuration labels', async () => {
    render(<EnterpriseLoginChannelPanel />);

    await waitFor(() => {
      expect(screen.getByText('飞书')).toBeInTheDocument();
    });

    expect(screen.getByText('本地账户')).toBeInTheDocument();
    expect(screen.getByText('LDAP')).toBeInTheDocument();
    expect(screen.getByText('钉钉')).toBeInTheDocument();
    expect(screen.getByText('企业微信')).toBeInTheDocument();
    expect(screen.queryByText('未配置')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('请输入您的账户名')).not.toBeInTheDocument();
  });

  it('starts Feishu OAuth when the Feishu channel is clicked', async () => {
    render(<EnterpriseLoginChannelPanel />);

    await userEvent.click(screen.getByRole('button', { name: /飞书/ }));

    expect(startOAuthAuthorize).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/feishu/authorize')
    );
  });

  it('warns before starting OAuth for unavailable providers', async () => {
    render(<EnterpriseLoginChannelPanel />);

    await userEvent.click(screen.getByRole('button', { name: /钉钉/ }));

    expect(startOAuthAuthorize).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/dingtalk/authorize')
    );
    expect(Message.warning).toHaveBeenCalledWith(
      '您的企业尚未开通 钉钉 登录，请联系管理员或改用其他方式。'
    );
  });

  it('submits LDAP login after selecting the LDAP channel', async () => {
    loginWithLdapMock.mockResolvedValue({ success: true, user: { id: '1', username: 'ldap-user' } });
    render(<EnterpriseLoginChannelPanel />);

    await userEvent.click(screen.getByRole('button', { name: /LDAP/ }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('请输入您的账户名')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('请输入您的账户名'), 'ldap-user');
    await userEvent.type(screen.getByPlaceholderText('请输入您的密码'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(loginWithLdapMock).toHaveBeenCalledWith({
      username: 'ldap-user',
      password: 'secret',
    });
  });

  it('still shows organization login channels when signed in locally but not joined', async () => {
    authState.status = 'authenticated';
    authState.user = { id: 'local-admin', username: 'admin', tenant_id: 'default' };
    render(<EnterpriseLoginChannelPanel />);

    await waitFor(() => {
      expect(screen.getByText('飞书')).toBeInTheDocument();
    });

    expect(screen.getByText(/当前已登录本地 WebUI 账号 admin/)).toBeInTheDocument();
    expect(screen.getByText(/尚未以企业成员身份登录/)).toBeInTheDocument();
    expect(screen.queryByText(/当前以本地账户 admin 登录/)).not.toBeInTheDocument();
    expect(screen.queryByText(/可直接在下方使用邀请码加入企业/)).not.toBeInTheDocument();
  });

  it('explains that desktop local operator still needs browser WebUI login', async () => {
    authState.status = 'authenticated';
    authState.user = { id: 'desktop-local-admin', username: 'admin', tenant_id: 'default' };
    render(<EnterpriseLoginChannelPanel />);

    await waitFor(() => {
      expect(screen.getByText('飞书')).toBeInTheDocument();
    });

    expect(screen.getByText(/请先在浏览器 WebUI 登录/)).toBeInTheDocument();
    expect(screen.queryByText(/当前以本地账户 admin 登录/)).not.toBeInTheDocument();
  });
});
