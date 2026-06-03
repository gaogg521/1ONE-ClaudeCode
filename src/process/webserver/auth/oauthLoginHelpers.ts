/**
 * Shared OAuth login completion for browser SSO callbacks.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response } from 'express';
import { isElectronDesktopWebuiRequest } from '@/common/config/webuiClientHeaders';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository, type AuthUser } from '@process/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, getCookieOptions } from '@process/webserver/config/constants';
import { resolveOAuthPostLoginRedirectPath } from '@/common/auth/enterpriseRoles';
import { registerBrowserWebuiLoginSession } from '@process/webserver/auth/registerBrowserWebuiLoginSession';
import { refreshUserAfterEnterpriseAutoJoin } from '@process/webserver/auth/enterpriseAutoJoin';

function normalizeWebRole(role: string | undefined): 'member' | 'org_admin' | 'system_admin' {
  if (!role) return 'member';
  if (role === 'admin') return 'system_admin';
  if (role === 'user') return 'member';
  if (role === 'system_admin' || role === 'org_admin' || role === 'member') return role;
  return 'member';
}

function buildAuthResponseUser(
  user: Pick<AuthUser, 'id' | 'username' | 'tenant_id' | 'role'>,
  roleOverride?: string
): {
  id: string;
  username: string;
  role: 'member' | 'org_admin' | 'system_admin';
  tenant_id: string;
} {
  return {
    id: user.id,
    username: user.username,
    role: normalizeWebRole(roleOverride ?? user.role),
    tenant_id: user.tenant_id ?? 'default',
  };
}

export async function finalizeOAuthBrowserLogin(
  req: Request,
  res: Response,
  input: {
    user: AuthUser;
    redirectTarget: string;
    roleOverride?: string;
  }
): Promise<void> {
  const joinedUser = await refreshUserAfterEnterpriseAutoJoin(input.user);
  const authUser = buildAuthResponseUser(joinedUser, input.roleOverride);
  const sessionToken = await AuthService.generateToken(authUser);
  await UserRepository.updateLastLogin(joinedUser.id);
  res.cookie(AUTH_CONFIG.COOKIE.NAME, sessionToken, {
    ...getCookieOptions(),
    maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
  });
  registerBrowserWebuiLoginSession(req, authUser, sessionToken, authUser.role);
  const target = resolveOAuthPostLoginRedirectPath(
    input.redirectTarget,
    authUser.role,
    authUser.tenant_id
  );
  res.redirect(`/#${target}`);
}

/** Desktop renderer cannot read cross-origin `Location` on 302; return JSON instead. */
export function shouldReturnOAuthAuthorizeJson(req: Pick<Request, 'headers' | 'query'>): boolean {
  if (String(req.query.format ?? '') === 'json') {
    return true;
  }
  return isElectronDesktopWebuiRequest(req.headers as Record<string, unknown>);
}

export function sendOAuthAuthorizeRedirect(
  res: Response,
  req: Pick<Request, 'headers' | 'query'>,
  goto: string
): void {
  if (shouldReturnOAuthAuthorizeJson(req)) {
    res.json({ success: true, data: { goto } });
    return;
  }
  res.redirect(goto);
}

export function respondOAuthProviderUnavailable(
  res: Response,
  input: { providerLabel: string; configured: boolean; enabled: boolean }
): void {
  if (!input.configured) {
    res.status(404).json({
      success: false,
      code: 'NOT_CONFIGURED',
      message: `${input.providerLabel} login is not configured`,
    });
    return;
  }
  if (!input.enabled) {
    res.status(404).json({
      success: false,
      code: 'NOT_ENABLED',
      message: `${input.providerLabel} login is configured but not enabled`,
    });
    return;
  }
}
