/**
 * Enterprise WebUI RBAC — shared by renderer and main process.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  canAccessEnterpriseRoute,
  ENTERPRISE_AUTH_PATH,
  ENTERPRISE_HOME_PATH,
  getEnterpriseRouteMetaByPath,
} from './enterpriseRoutes';

export const ENTERPRISE_JOIN_PATH = '/enterprise/join';
export const ENTERPRISE_ADMIN_HOME_PATH = ENTERPRISE_HOME_PATH;
export const ENTERPRISE_WORKSPACE_PATH = '/guid';

export function isEnterpriseAdminRole(role: string | undefined): boolean {
  return role === 'system_admin' || role === 'org_admin' || role === 'admin';
}

export const WEBUI_BUILTIN_ADMIN_USER_ID = 'system_default_user';
/** 桌面端占位身份（非 WebUI 登录会话），不得用于企业后台鉴权 */
export const DESKTOP_OPERATOR_USER_ID = 'desktop-local-admin';

export type WebuiPrincipal = {
  id?: string;
  username?: string;
  role?: string;
  tenant_id?: string;
};

/**
 * 是否可访问企业「管理后台」（LDAP/邀请码/用户管理等）。
 * 仅认 JWT/DB 中的管理员角色；不认用户名、不认桌面占位身份。
 */
export function isWebuiBuiltinAdministrator(principal: WebuiPrincipal | null | undefined): boolean {
  if (!principal) return false;
  if (principal.id === DESKTOP_OPERATOR_USER_ID) return false;
  return isEnterpriseAdminRole(principal.role);
}

/** @deprecated 使用 isWebuiBuiltinAdministrator；保留别名避免大范围重命名 */
export const canAccessEnterpriseAdminConsole = isWebuiBuiltinAdministrator;

export function resolveWebuiAdministratorRole(
  principal: WebuiPrincipal | null | undefined
): string | undefined {
  return principal?.role;
}

export function isSystemAdminRole(role: string | undefined): boolean {
  return role === 'system_admin';
}

export function hasEnterpriseTenant(tenantId: string | undefined): boolean {
  return Boolean(tenantId && tenantId.trim() !== '' && tenantId !== 'default');
}

/** 控制台展示名：未创建/加入企业前不要直接显示租户 id `default`。 */
export function resolveEnterpriseTenantDisplayLabel(
  tenantId: string | undefined,
  tenantName: string | null | undefined
): string {
  const tid = (tenantId ?? 'default').trim() || 'default';
  if (!hasEnterpriseTenant(tid)) {
    return tenantName?.trim() || '单机实例';
  }
  return tenantName?.trim() || tid;
}

/**
 * 个人版 ↔ 企业版（工作区）切换后的落点 — 所有已加入成员（含管理员）均进工作区。
 */
export function resolveEnterpriseEditionPath(hasJoinedEnterprise: boolean): string {
  return hasJoinedEnterprise ? ENTERPRISE_WORKSPACE_PATH : ENTERPRISE_JOIN_PATH;
}

/** 组织管理后台（LDAP/邀请码/成员等），与版本切换无关。 */
export function resolveEnterpriseAdminPath(): string {
  return ENTERPRISE_ADMIN_HOME_PATH;
}

/**
 * 登录后 redirect 解析：/enterprise* 不再默认进管理后台。
 */
export function resolvePostLoginRedirectPath(
  rawTarget: string,
  role: string | undefined,
  tenantId: string | undefined,
  isDesktop = false
): string {
  const joined = hasEnterpriseTenant(tenantId);
  const isSystemAdmin = isSystemAdminRole(role);
  if (rawTarget === ENTERPRISE_JOIN_PATH || rawTarget.startsWith(`${ENTERPRISE_JOIN_PATH}/`)) {
    return joined ? ENTERPRISE_WORKSPACE_PATH : ENTERPRISE_JOIN_PATH;
  }

  const route = getEnterpriseRouteMetaByPath(rawTarget);
  if (route) {
    if (!joined && !isSystemAdmin) {
      return ENTERPRISE_JOIN_PATH;
    }
    if (!canAccessEnterpriseRoute(route, role, isDesktop)) {
      return ENTERPRISE_ADMIN_HOME_PATH;
    }
    return rawTarget;
  }

  if (rawTarget === ENTERPRISE_ADMIN_HOME_PATH || rawTarget.startsWith(`${ENTERPRISE_ADMIN_HOME_PATH}/`)) {
    return joined || isSystemAdmin ? ENTERPRISE_ADMIN_HOME_PATH : ENTERPRISE_JOIN_PATH;
  }
  return rawTarget;
}

/** OAuth 登录后安全落点：避免回到 settings/login 等易触发未构建静态资源的页面。 */
export function resolveOAuthPostLoginRedirectPath(
  rawTarget: string,
  role: string | undefined,
  tenantId: string | undefined
): string {
  const target = resolvePostLoginRedirectPath(rawTarget, role, tenantId, false);
  // OAuth sign-in succeeded: never bounce an authenticated user back to the enterprise
  // join/login page just because there is no enterprise to join yet — that is the SSO
  // sign-in loop. Land them in the personal workspace instead; they can still join via
  // invite code later, once an admin has actually created the enterprise.
  if (target === ENTERPRISE_JOIN_PATH && !hasEnterpriseTenant(tenantId)) {
    return ENTERPRISE_WORKSPACE_PATH;
  }
  if (target.startsWith('/settings') || target.startsWith('/login')) {
    return ENTERPRISE_WORKSPACE_PATH;
  }
  // Legacy OAuth redirects targeted /enterprise/auth — send admins to console home.
  if (target === ENTERPRISE_AUTH_PATH && isEnterpriseAdminRole(role)) {
    return ENTERPRISE_ADMIN_HOME_PATH;
  }
  return target;
}
