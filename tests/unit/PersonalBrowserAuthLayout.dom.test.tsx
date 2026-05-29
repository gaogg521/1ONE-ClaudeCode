import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authStateMock = vi.hoisted(() => ({
  current: {
    ready: true,
    status: 'unauthenticated' as 'checking' | 'authenticated' | 'unauthenticated',
    user: null as { id: string; username: string } | null,
  },
}));
const isDesktopMock = vi.hoisted(() => vi.fn(() => false));
const setPostLoginRedirectMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authStateMock.current,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => isDesktopMock(),
}));

vi.mock('@/renderer/utils/postLoginRedirect', () => ({
  setPostLoginRedirect: (...args: unknown[]) => setPostLoginRedirectMock(...args),
}));

vi.mock('@/renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader'>loading</div>,
}));

vi.mock('@/renderer/components/layout/PersonalRouteErrorBoundary', () => ({
  default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import PersonalBrowserAuthLayout from '@/renderer/components/layout/PersonalBrowserAuthLayout';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid='location'>{`${location.pathname}${location.search}`}</div>;
}

function renderGuard(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<PersonalBrowserAuthLayout />}>
          <Route path='/guid' element={<div>guid page</div>} />
          <Route path='/enterprise/join' element={<div>join page</div>} />
        </Route>
        <Route path='/login' element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PersonalBrowserAuthLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDesktopMock.mockReturnValue(false);
    authStateMock.current = {
      ready: true,
      status: 'unauthenticated',
      user: null,
    };
  });

  it('redirects unauthenticated browser WebUI workspace routes to login with return target', async () => {
    renderGuard('/guid?tab=agents');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/login?redirect=%2Fguid%3Ftab%3Dagents');
    });
    expect(setPostLoginRedirectMock).toHaveBeenCalledWith('/guid?tab=agents');
  });

  it('keeps public enterprise join route accessible before login', () => {
    renderGuard('/enterprise/join');

    expect(screen.getByText('join page')).toBeInTheDocument();
    expect(setPostLoginRedirectMock).not.toHaveBeenCalled();
  });

  it('does not block desktop routes with browser WebUI authentication state', () => {
    isDesktopMock.mockReturnValue(true);

    renderGuard('/guid');

    expect(screen.getByText('guid page')).toBeInTheDocument();
  });

  it('keeps an existing user visible during background auth checks', () => {
    authStateMock.current = {
      ready: true,
      status: 'checking',
      user: { id: 'u1', username: 'alice' },
    };

    renderGuard('/guid');

    expect(screen.getByText('guid page')).toBeInTheDocument();
    expect(screen.queryByTestId('app-loader')).not.toBeInTheDocument();
  });

  it('shows a loader before the initial auth check is ready', () => {
    authStateMock.current = {
      ready: false,
      status: 'checking',
      user: null,
    };

    renderGuard('/guid');

    expect(screen.getByTestId('app-loader')).toBeInTheDocument();
  });
});
