import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const locationMock = vi.hoisted(() => ({ pathname: '/enterprise' }));
const authMock = vi.hoisted(() => vi.fn());
const enterpriseModeMock = vi.hoisted(() => vi.fn());
const isDesktopMock = vi.hoisted(() => ({ current: true }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; [key: string]: unknown }) => {
      const template = options?.defaultValue;
      if (!template) return _key;
      return Object.entries(options ?? {}).reduce((result, [key, value]) => {
        if (key === 'defaultValue') return result;
        return result.replaceAll(`{{${key}}}`, String(value ?? ''));
      }, template);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid='navigate' data-to={to} />,
  Outlet: () => <div data-testid='outlet' />,
  useLocation: () => locationMock,
  useNavigate: () => vi.fn(),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => enterpriseModeMock(),
}));

vi.mock('@/renderer/hooks/enterprise/useEnterpriseRuntime', () => ({
  EnterpriseRuntimeProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useEnterpriseRuntime: () => ({ status: 'ready' }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => isDesktopMock.current,
}));

vi.mock('@/renderer/components/layout/Titlebar', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/layout/EditionModeSwitcher', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/enterprise/components/EnterpriseNavSidebar', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/enterprise/components/EnterpriseRouteErrorBoundary', () => ({
  default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/renderer/pages/settings/enterpriseGateContext', () => ({
  EnterpriseGateProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/renderer/pages/enterprise/enterpriseNav', () => ({
  getEnterpriseNavItemByPath: () => ({ labelKey: 'enterprise.home', label: 'Enterprise' }),
}));

vi.mock('@/renderer/pages/enterprise/components/DesktopEnterprisePlaceholder', () => ({
  default: ({ enterpriseBrowserUrl }: { enterpriseBrowserUrl: string }) => (
    <div data-testid='desktop-placeholder-url'>{enterpriseBrowserUrl}</div>
  ),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: () => null,
  Button: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
  Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Spin: () => <div data-testid='spin' />,
  Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Typography: {
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  },
}));

import EnterpriseLayout from '@/renderer/pages/enterprise/EnterpriseLayout';

describe('EnterpriseLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationMock.pathname = '/enterprise';
    isDesktopMock.current = true;
    authMock.mockReturnValue({
      user: { id: 'desktop-local-admin', username: 'Desktop' },
      status: 'authenticated',
    });
    enterpriseModeMock.mockReturnValue({
      loading: false,
      hasJoinedEnterprise: false,
      effectiveRole: undefined,
      enterpriseContext: null,
      webuiApiBase: 'http://127.0.0.1:25809',
      openEnterpriseAdminInBrowser: vi.fn(),
    });
  });

  it('uses admin login intent for desktop browser enterprise console URL', () => {
    render(<EnterpriseLayout />);

    expect(screen.getByTestId('desktop-placeholder-url')).toHaveTextContent(
      'http://127.0.0.1:25809/#/login?redirect=%2Fenterprise&mode=admin'
    );
  });
});
