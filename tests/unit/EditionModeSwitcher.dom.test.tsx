import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  status: 'authenticated',
}));
const enterpriseModeState = vi.hoisted(() => ({
  loading: false,
  hasJoinedEnterprise: true,
  managementMode: 'enterprise',
  enterpriseContext: { tenantId: 'tenant-1', tenantName: 'Acme Corp' },
  setManagementMode: vi.fn(),
  openEnterpriseAdminInBrowser: vi.fn(),
  openEnterpriseLoginInBrowser: vi.fn(),
  showEnterpriseAdminNav: false,
  canUseEnterpriseEditionSwitcher: true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown> & { defaultValue?: string }) => {
      const template = options?.defaultValue || _key;
      return Object.entries(options ?? {}).reduce((acc, [key, value]) => {
        if (key === 'defaultValue') {
          return acc;
        }
        return acc.replaceAll(`{{${key}}}`, String(value));
      }, template);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => enterpriseModeState,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => true),
}));

vi.mock('@/renderer/utils/openAdminConsole', () => ({
  openAdminConsole: vi.fn(),
}));

vi.mock('@/renderer/utils/postLoginRedirect', () => ({
  setPostLoginRedirect: vi.fn(),
}));

vi.mock('@icon-park/react', () => ({
  Help: () => <span>help</span>,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
  Popover: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Radio: {
    Group: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import EditionModeSwitcher from '@/renderer/components/layout/EditionModeSwitcher';

describe('EditionModeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'authenticated';
    enterpriseModeState.loading = false;
    enterpriseModeState.hasJoinedEnterprise = true;
    enterpriseModeState.managementMode = 'enterprise';
    enterpriseModeState.enterpriseContext = { tenantId: 'tenant-1', tenantName: 'Acme Corp' };
    enterpriseModeState.showEnterpriseAdminNav = false;
    enterpriseModeState.canUseEnterpriseEditionSwitcher = true;
  });

  it('shows enterprise guest status in compact mode when instance joined but user not signed in', () => {
    authState.status = 'unauthenticated';

    render(<EditionModeSwitcher variant='compact' />);

    expect(screen.getByText('企业实例 · Acme Corp')).toBeTruthy();
    expect(screen.getByText('登录企业账号')).toBeTruthy();
  });

  it('shows enterprise guest status in bar mode when instance joined but user not signed in', () => {
    authState.status = 'unauthenticated';

    render(<EditionModeSwitcher variant='bar' />);

    expect(screen.getByText('企业实例 · Acme Corp')).toBeTruthy();
    expect(screen.getByText('登录企业账号')).toBeTruthy();
  });
});
