/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@/renderer/utils/platform';
import { getEnterpriseRouteMetaByPath } from '@/common/auth/enterpriseRoutes';

export type LoginIntent = 'standalone-webui' | 'enterprise-member' | 'webui-admin';

function sanitizeLoginReturnTo(returnTo: string): string {
  const safeReturn =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/login') ? returnTo : '/sessions';
  return safeReturn;
}

function buildLoginPath(returnTo: string, intent: LoginIntent): string {
  const safeReturn = sanitizeLoginReturnTo(returnTo);
  const params = new URLSearchParams({ redirect: safeReturn });
  if (intent === 'enterprise-member') {
    params.set('mode', 'enterprise');
    params.set('intent', 'enterprise-member');
  } else if (intent === 'webui-admin') {
    params.set('mode', 'admin');
    params.set('intent', 'webui-admin');
  }
  return `/login?${params.toString()}`;
}

export function buildEnterpriseLoginPath(returnTo: string): string {
  const path = buildLoginPath(returnTo, 'enterprise-member');
  return path.replace('&intent=enterprise-member', '');
}

export function buildWebuiAdminLoginPath(returnTo: string): string {
  const path = buildLoginPath(returnTo, 'webui-admin');
  return path.replace('&intent=webui-admin', '');
}

export function buildEnterpriseRouteLoginPath(returnTo: string): string {
  const route = getEnterpriseRouteMetaByPath(returnTo);
  const intent = route?.requiresRole === 'admin' || route?.requiresRole === 'system_admin'
    ? 'webui-admin'
    : 'enterprise-member';
  return buildLoginPath(returnTo, intent);
}

export function resolveLoginIntentFromSearch(search: string): LoginIntent {
  const params = new URLSearchParams(search);
  const intent = params.get('intent');
  if (intent === 'enterprise-member' || intent === 'webui-admin') {
    return intent;
  }
  const legacyMode = params.get('mode');
  if (legacyMode === 'enterprise') {
    return 'enterprise-member';
  }
  if (legacyMode === 'admin') {
    return 'webui-admin';
  }
  return 'standalone-webui';
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
