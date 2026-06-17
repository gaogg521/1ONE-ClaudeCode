/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';

/** Recommended offset when running a dedicated admin WebUI instance (e.g. ONE_PORT=member+1). */
export const WEBUI_ADMIN_PORT_OFFSET = 1;

export function resolveWebuiAdminPort(memberPort = WEBUI_DEFAULT_PORT): number {
  return memberPort + WEBUI_ADMIN_PORT_OFFSET;
}

/**
 * When the member port is taken, avoid bumping into the paired admin port (e.g. 25809→25810).
 */
export function nextWebuiMemberPortAfterConflict(occupiedPort: number, baseMemberPort = WEBUI_DEFAULT_PORT): number {
  let next = occupiedPort + 1;
  const reservedAdminSlot = resolveWebuiAdminPort(baseMemberPort);
  if (next === reservedAdminSlot) {
    next += 1;
  }
  return next;
}

export function buildWebuiMemberLoginSearch(redirect = '/guid'): string {
  const params = new URLSearchParams({ redirect, mode: 'enterprise' });
  return params.toString();
}

export function buildWebuiAdminLoginSearch(redirect = '/enterprise/auth'): string {
  const params = new URLSearchParams({ redirect, mode: 'admin' });
  return params.toString();
}

export function buildWebuiLoginHashUrl(origin: string, loginSearch: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/#/login?${loginSearch}`;
}

export function buildWebuiMemberLoginUrl(origin: string, redirect = '/guid'): string {
  return buildWebuiLoginHashUrl(origin, buildWebuiMemberLoginSearch(redirect));
}

export function buildWebuiAdminLoginUrl(origin: string, redirect = '/enterprise/auth'): string {
  return buildWebuiLoginHashUrl(origin, buildWebuiAdminLoginSearch(redirect));
}

/** Same host with memberPort+1 — use when a second WebUI instance listens on the admin port. */
export function buildWebuiAdminLoginUrlOnDedicatedPort(
  memberOrigin: string,
  redirect = '/enterprise/auth'
): string | null {
  try {
    const url = new URL(memberOrigin);
    const memberPort = Number(url.port) || WEBUI_DEFAULT_PORT;
    url.port = String(resolveWebuiAdminPort(memberPort));
    return buildWebuiAdminLoginUrl(url.origin, redirect);
  } catch {
    return null;
  }
}
