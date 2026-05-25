import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const loginMock = vi.hoisted(() => vi.fn());
const loginWithLdapMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@renderer/assets/logos/brand/app.png', () => ({
  default: 'login-logo.png',
}));

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
  useLocation: () => ({ search: '' }),
}));

vi.mock('@/common/auth/enterpriseRoles', () => ({
  resolvePostLoginRedirectPath: vi.fn(() => '/sessions'),
}));

vi.mock('@/renderer/utils/postLoginRedirect', () => ({
  consumePostLoginRedirect: vi.fn(() => null),
  readRedirectFromSearch: vi.fn(() => null),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => false),
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

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div>loading</div>,
}));

vi.mock('@icon-park/react', () => ({
  Lock: () => <span />,
  User: () => <span />,
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
  }: React.PropsWithChildren<{
    value?: string;
  }>) => (
    <label>
      <input type='radio' value={value} />
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
    },
    Radio,
    Select,
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
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          mode: 'enterprise',
          ldapEnabled: false,
          feishuEnabled: false,
          dingtalkEnabled: true,
          wecomEnabled: true,
          ldapConfigured: false,
          feishuConfigured: false,
          dingtalkConfigured: true,
          wecomConfigured: true,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('does not render DingTalk or WeCom login buttons before their OAuth callbacks are implemented', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('登录您的账户')).toBeInTheDocument();
    });

    expect(screen.queryByText('使用钉钉登录')).not.toBeInTheDocument();
    expect(screen.queryByText('使用企业微信登录')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login.submit' })).toBeInTheDocument();
  });
});
