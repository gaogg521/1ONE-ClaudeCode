/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@/renderer/utils/platform';

export function buildEnterpriseLoginPath(returnTo: string): string {
  const safeReturn =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/login') ? returnTo : '/sessions';
  const params = new URLSearchParams({
    redirect: safeReturn,
    mode: 'enterprise',
  });
  return `/login?${params.toString()}`;
}

export function readCurrentHashPath(): string {
  if (typeof window === 'undefined') {
    return '/sessions';
  }
  const hash = window.location.hash.replace(/^#/, '');
  const path = hash.split('?')[0] || '/sessions';
  return path.startsWith('/') ? path : `/${path}`;
}

/** Desktop app should log in inside the client so JWT is written to the desktop session store. */
export function preferInAppEnterpriseLogin(): boolean {
  return isElectronDesktop();
}
