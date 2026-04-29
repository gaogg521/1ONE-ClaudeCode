/**
 * Enterprise WebUI RBAC — single source of truth for role checks (avoid Layout vs API drift).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enterprise admin gate (users/teams/bindings + elevation), aligned with Layout nav and kanban `isPrivileged`.
 *
 * Note: `TokenMiddleware` maps DB role `admin` → `system_admin` on `req.user`, so live HTTP requests
 * rarely see literal `admin`; keeping `admin` here matches JSON from DB/list APIs and defensive checks.
 */
export function isEnterpriseAdminRole(role: string | undefined): boolean {
  return role === 'system_admin' || role === 'org_admin' || role === 'admin';
}

/** May enter enterprise panel and complete secondary (password/LDAP) elevation. */
export function isEnterpriseElevatableRole(role: string | undefined): boolean {
  return isEnterpriseAdminRole(role);
}

/** Global auth provider config (LDAP secrets, Feishu app keys) — highest privilege only. */
export function isSystemAdminRole(role: string | undefined): boolean {
  return role === 'system_admin';
}
