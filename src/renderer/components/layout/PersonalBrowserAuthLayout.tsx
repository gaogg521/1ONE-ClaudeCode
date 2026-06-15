/**
 * Browser WebUI: personal workspace routes require a signed-in session.
 * Desktop Electron keeps the local operator identity without WebUI login.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import AppLoader from '@/renderer/components/layout/AppLoader';
import PersonalRouteErrorBoundary from '@/renderer/components/layout/PersonalRouteErrorBoundary';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { setPostLoginRedirect } from '@/renderer/utils/postLoginRedirect';

const PUBLIC_PERSONAL_PATHS = ['/enterprise/join'] as const;

function isPublicPersonalPath(pathname: string): boolean {
  return PUBLIC_PERSONAL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const PersonalBrowserAuthLayout: React.FC = () => {
  const { status, user, ready } = useAuth();
  const location = useLocation();

  if (isElectronDesktop()) {
    return (
      <PersonalRouteErrorBoundary>
        <Outlet />
      </PersonalRouteErrorBoundary>
    );
  }

  if (!ready || (status === 'checking' && !user)) {
    return <AppLoader />;
  }

  if (!isPublicPersonalPath(location.pathname) && status !== 'authenticated' && !user) {
    const returnPath = `${location.pathname}${location.search}`;
    if (returnPath && returnPath !== '/login') {
      setPostLoginRedirect(returnPath);
    }
    const redirectTarget = returnPath && returnPath !== '/login' ? returnPath : '/guid';
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectTarget)}`} replace />;
  }

  return (
    <PersonalRouteErrorBoundary>
      <Outlet />
    </PersonalRouteErrorBoundary>
  );
};

export default PersonalBrowserAuthLayout;
