import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Outlet } from 'react-router-dom';

const authStateMock = vi.hoisted(() => ({
  current: {
    ready: true,
    status: 'unauthenticated' as 'checking' | 'authenticated' | 'unauthenticated',
    user: null as null | { id: string; username: string; role?: string; tenant_id?: string },
  },
}));

const webuiEnterpriseModeMock = vi.hoisted(() => ({
  current: {
    loading: false,
  },
}));

const setPostLoginRedirectMock = vi.hoisted(() => vi.fn());
const isDesktopMock = vi.hoisted(() => ({ current: false }));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authStateMock.current,
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => webuiEnterpriseModeMock.current,
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader'>loading</div>,
}));

vi.mock('@renderer/components/layout/PersonalBrowserAuthLayout', () => ({
  default: () => (
    <div data-testid='personal-browser-auth-layout'>
      <Outlet />
    </div>
  ),
}));

vi.mock('@renderer/components/layout/PersonalShell', () => ({
  default: () => (
    <div data-testid='personal-shell'>
      <Outlet />
    </div>
  ),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => isDesktopMock.current,
}));

vi.mock('@/renderer/utils/postLoginRedirect', () => ({
  consumePostLoginRedirect: vi.fn(() => null),
  readRedirectFromSearch: vi.fn(() => null),
  setPostLoginRedirect: (...args: unknown[]) => setPostLoginRedirectMock(...args),
}));

vi.mock('@/common/auth/enterpriseRoles', async () => {
  const actual = await vi.importActual<typeof import('@/common/auth/enterpriseRoles')>(
    '@/common/auth/enterpriseRoles'
  );
  return {
    ...actual,
    resolvePostLoginRedirectPath: vi.fn((target: string | null | undefined) => target ?? '/sessions'),
  };
});

vi.mock('@renderer/pages/login', () => ({
  default: () => <div data-testid='login-page'>{window.location.hash}</div>,
}));

vi.mock('@renderer/pages/enterprise/EnterpriseLayout', () => ({
  default: () => (
    <div data-testid='enterprise-layout'>
      enterprise-layout
      <Outlet />
    </div>
  ),
}));

vi.mock('@renderer/pages/enterprise/EnterpriseHome', () => ({
  default: () => <div data-testid='enterprise-home'>enterprise-home</div>,
}));

vi.mock('@renderer/pages/issues', () => ({
  default: () => <div data-testid='issues-page'>issues-page</div>,
}));

vi.mock('@renderer/pages/issues/IssueDetailPage', () => ({
  default: () => <div data-testid='issue-detail-page'>issue-detail-page</div>,
}));

vi.mock('@renderer/pages/skills', () => ({
  default: () => <div data-testid='skills-page'>skills-page</div>,
}));

vi.mock('@renderer/pages/skills/SkillDetailPage', () => ({
  default: () => <div data-testid='skill-detail-page'>skill-detail-page</div>,
}));

vi.mock('@renderer/pages/superAssistant', () => ({
  default: () => <div data-testid='super-assistant-page'>super-assistant-page</div>,
}));

import Router from '@/renderer/components/layout/Router';

describe('Router enterprise auth redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateMock.current = {
      ready: true,
      status: 'unauthenticated',
      user: null,
    };
    webuiEnterpriseModeMock.current = {
      loading: false,
    };
    isDesktopMock.current = false;
    window.location.hash = '#/enterprise/auth';
  });

  it('redirects unauthenticated enterprise auth route to enterprise login mode', async () => {
    render(<Router />);

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent(
        '#/login?redirect=%2Fenterprise%2Fauth&mode=admin&intent=webui-admin'
      );
    });

    expect(setPostLoginRedirectMock).toHaveBeenCalledWith('/enterprise/auth');
  });

  it('does not redirect desktop enterprise home to login', async () => {
    isDesktopMock.current = true;
    window.location.hash = '#/enterprise';

    render(<Router />);

    await waitFor(() => {
      expect(screen.getByTestId('enterprise-layout')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(setPostLoginRedirectMock).not.toHaveBeenCalled();
  });

  it('does not redirect desktop enterprise sub-routes to login', async () => {
    isDesktopMock.current = true;
    window.location.hash = '#/enterprise/users';

    render(<Router />);

    await waitFor(() => {
      expect(screen.getByTestId('enterprise-layout')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(setPostLoginRedirectMock).not.toHaveBeenCalled();
  });

  it('keeps product routes available for issues and skills', async () => {
    authStateMock.current = {
      ready: true,
      status: 'authenticated',
      user: { id: 'user-1', username: 'demo', role: 'org_admin', tenant_id: 'tenant-1' },
    };

    window.location.hash = '#/issues';
    const { rerender } = render(<Router />);
    await waitFor(() => {
      expect(screen.getByTestId('issues-page')).toBeInTheDocument();
    });

    window.location.hash = '#/skills/skill-1';
    rerender(<Router />);
    await waitFor(() => {
      expect(screen.getByTestId('skill-detail-page')).toBeInTheDocument();
    });
  });
});
