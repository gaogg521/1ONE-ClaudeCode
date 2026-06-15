/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import type { EnterpriseNavItem } from '@/renderer/pages/enterprise/enterpriseNav';
import {
  getEnterpriseNavItemByKey,
  getEnterpriseNavItemByPath,
  getVisibleEnterpriseNavItems,
} from '@/renderer/pages/enterprise/enterpriseNav';
import { normalizeEnterpriseApiError, type EnterpriseRuntimeIssue } from '@/renderer/utils/enterpriseApi/error';
import { canAccessEnterprisePlatform, canAccessEnterpriseRouteRole } from '@/common/auth/enterpriseRoutes';
import { isEnterpriseAdminRole, isSystemAdminRole } from '@/common/auth/enterpriseRoles';
import { isElectronDesktop } from '@/renderer/utils/platform';

export type EnterpriseRuntimeStatus =
  | 'loading'
  | 'ready'
  | 'unsupported_platform'
  | 'not_authenticated'
  | 'not_joined'
  | 'webui_unavailable'
  | 'insufficient_role';

type EnterpriseRuntimeContextValue = {
  activeNavItem: EnterpriseNavItem;
  visibleNavItems: EnterpriseNavItem[];
  status: EnterpriseRuntimeStatus;
  issue: EnterpriseRuntimeIssue | null;
  loading: boolean;
  joined: boolean;
  refresh: () => Promise<void>;
};

const EnterpriseRuntimeContext = createContext<EnterpriseRuntimeContextValue | undefined>(undefined);

export const EnterpriseRuntimeProvider: React.FC<React.PropsWithChildren<{ pathname: string }>> = ({
  pathname,
  children,
}) => {
  const auth = useAuth();
  const enterpriseMode = useWebuiEnterpriseMode();
  const isDesktop = isElectronDesktop();

  const effectiveRole = enterpriseMode.effectiveRole ?? auth.user?.role;
  const canBypassJoinRequirement = isEnterpriseAdminRole(effectiveRole);
  const isSystemAdmin = isSystemAdminRole(effectiveRole);
  const activeNavItem = useMemo(
    () => getEnterpriseNavItemByPath(pathname) ?? getEnterpriseNavItemByKey('home')!,
    [pathname]
  );
  const visibleNavItems = useMemo(
    () => getVisibleEnterpriseNavItems(effectiveRole, isDesktop),
    [effectiveRole, isDesktop]
  );

  const joined = enterpriseMode.hasJoinedEnterprise;
  const loading = enterpriseMode.loading || (auth.status === 'checking' && auth.user === null);

  const refresh = useCallback(async () => {
    await Promise.all([auth.refresh(), enterpriseMode.refreshEnterpriseContext()]);
  }, [auth, enterpriseMode]);

  const issue = useMemo<EnterpriseRuntimeIssue | null>(() => {
    if (loading) {
      return null;
    }
    if (!enterpriseMode.webuiApiBase && typeof window !== 'undefined' && window.electronAPI) {
      return normalizeEnterpriseApiError(new Error('WEBUI_NOT_RUNNING'));
    }
    const hasSession = auth.status === 'authenticated' || auth.user !== null;
    if (!hasSession) {
      return { code: 'not_authenticated', message: '当前未登录企业后台。' };
    }
    if (!joined && !canBypassJoinRequirement) {
      return { code: 'not_joined', message: '当前账号尚未加入企业，请先完成企业接入。' };
    }
    if (!canAccessEnterprisePlatform(activeNavItem.platformPolicy, isDesktop)) {
      return {
        code: 'unsupported_platform',
        message:
          activeNavItem.platformPolicy === 'browser'
            ? '当前模块仅支持在浏览器中访问。'
            : '当前模块仅支持在桌面端访问。',
      };
    }
    if (!canAccessEnterpriseRouteRole(activeNavItem.requiresRole, effectiveRole)) {
      const needsSystemAdmin = activeNavItem.requiresRole === 'system_admin' && !isSystemAdmin;
      return {
        code: 'insufficient_role',
        message: needsSystemAdmin
          ? '该页面仅系统管理员可访问。请在用户管理中将账号提升为系统管理员，或联系已有系统管理员。'
          : '当前账号没有访问该管理模块的权限。',
      };
    }
    return null;
  }, [
    activeNavItem.platformPolicy,
    activeNavItem.requiresRole,
    auth.status,
    auth.user,
    canBypassJoinRequirement,
    effectiveRole,
    enterpriseMode.webuiApiBase,
    isDesktop,
    isSystemAdmin,
    joined,
    loading,
  ]);

  const status: EnterpriseRuntimeStatus = loading
    ? 'loading'
    : issue?.code === 'webui_unavailable'
      ? 'webui_unavailable'
      : issue?.code === 'unsupported_platform'
        ? 'unsupported_platform'
        : issue?.code === 'not_authenticated'
          ? 'not_authenticated'
          : issue?.code === 'not_joined'
            ? 'not_joined'
            : issue?.code === 'insufficient_role'
              ? 'insufficient_role'
              : 'ready';

  const value = useMemo<EnterpriseRuntimeContextValue>(
    () => ({
      activeNavItem,
      visibleNavItems,
      status,
      issue,
      loading,
      joined,
      refresh,
    }),
    [activeNavItem, visibleNavItems, issue, joined, loading, refresh, status]
  );

  return React.createElement(EnterpriseRuntimeContext.Provider, { value }, children);
};

export function useEnterpriseRuntime(): EnterpriseRuntimeContextValue {
  const context = useContext(EnterpriseRuntimeContext);
  if (!context) {
    throw new Error('useEnterpriseRuntime must be used within EnterpriseRuntimeProvider');
  }
  return context;
}
