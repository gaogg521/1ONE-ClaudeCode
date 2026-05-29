/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { webui } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import {
  DEFAULT_WEBUI_MANAGEMENT_MODE,
  type EnterpriseContextSnapshot,
  type WebuiManagementMode,
  WEBUI_MANAGEMENT_MODE_KEY,
  normalizeWebuiManagementMode,
} from '@/common/config/webuiEnterpriseConfig';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { fetchWebuiApi, getWebuiApiBaseUrl } from '@/renderer/utils/webuiApiBase';
import {
  createEnterprise,
  joinEnterpriseWithCode,
} from '@/renderer/utils/enterpriseJoinApi';
import { isEnterpriseAdminRole, resolveEnterpriseEditionPath } from '@/common/auth/enterpriseRoles';
import {
  mergeDesktopEnterpriseContext,
  persistEnterpriseWorkspaceEdition,
} from '@/common/auth/enterpriseEditionSync';
import { isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import { setPostLoginRedirect } from '@/renderer/utils/postLoginRedirect';
import type { EnterpriseJoinResult } from '@/common/types/enterpriseJoin';

export type WebuiEnterpriseModeValue = {
  loading: boolean;
  hasJoinedEnterprise: boolean;
  /** Web 登录用户角色，或桌面端 enterpriseContext.role */
  effectiveRole: string | undefined;
  managementMode: WebuiManagementMode;
  enterpriseContext: EnterpriseContextSnapshot | null;
  /** 侧栏 / 标题栏「管理后台」入口：组织管理员（含未加入企业的本地超管） */
  showEnterpriseAdminNav: boolean;
  webuiApiBase: string | null;
  setManagementMode: (mode: WebuiManagementMode) => Promise<void>;
  refreshEnterpriseContext: () => Promise<void>;
  openEnterpriseAdminInBrowser: () => Promise<'opened' | 'webui_not_running' | 'failed'>;
  /** Opens WebUI login with post-login redirect to /enterprise (LDAP / Feishu / invite flow). */
  openEnterpriseLoginInBrowser: () => Promise<'opened' | 'webui_not_running' | 'failed'>;
  canCreateEnterprise: boolean;
  joinWithInviteCode: (code: string) => Promise<EnterpriseJoinResult>;
  createEnterpriseOrganization: (name: string) => Promise<void>;
};

const WebuiEnterpriseModeContext = createContext<WebuiEnterpriseModeValue | null>(null);

export const WebuiEnterpriseModeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, refresh: refreshAuth } = useAuth();
  const isDesktop = isElectronDesktop();
  const [loading, setLoading] = useState(true);
  const [managementMode, setManagementModeState] = useState<WebuiManagementMode>(DEFAULT_WEBUI_MANAGEMENT_MODE);
  const [enterpriseContext, setEnterpriseContext] = useState<EnterpriseContextSnapshot | null>(null);
  const [webuiApiBase, setWebuiApiBase] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    const stored = await ConfigStorage.get(WEBUI_MANAGEMENT_MODE_KEY).catch((): undefined => undefined);
    setManagementModeState(normalizeWebuiManagementMode(stored));
  }, []);

  const fetchBrowserEnterpriseContext = useCallback(async (): Promise<EnterpriseContextSnapshot | null> => {
    try {
      const res = await fetchWebuiApi('/api/auth/enterprise-context');
      const body = (await res.json().catch((): null => null)) as {
        success?: boolean;
        data?: EnterpriseContextSnapshot;
      };
      if (res.ok && body?.success && body.data) {
        return body.data;
      }
    } catch {
      // not logged in to WebUI or service down
    }
    return null;
  }, []);

  const refreshEnterpriseContext = useCallback(async () => {
    const base = await getWebuiApiBaseUrl();
    setWebuiApiBase(base);

    if (isDesktop) {
      let ipcCtx: EnterpriseContextSnapshot = {
        joined: false,
        tenantId: 'default',
        tenantName: null,
        canCreateEnterprise: false,
      };
      try {
        const result = await webui.getEnterpriseContext.invoke();
        if (result.success && result.data) {
          ipcCtx = result.data;
        }
      } catch {
        // keep default ipcCtx
      }

      const browserCtx = base ? await fetchBrowserEnterpriseContext() : null;
      setEnterpriseContext(mergeDesktopEnterpriseContext(ipcCtx, browserCtx));
      return;
    }

    if (!user) {
      setEnterpriseContext(null);
      return;
    }

    try {
      const res = await fetchWebuiApi('/api/auth/enterprise-context');
      const body = (await res.json().catch((): null => null)) as {
        success?: boolean;
        data?: EnterpriseContextSnapshot;
      };
      if (res.ok && body?.success && body.data) {
        setEnterpriseContext(body.data);
        return;
      }
    } catch {
      // ignore
    }

    const tenantId = user.tenant_id ?? 'default';
    setEnterpriseContext({
      joined: isEnterpriseTenantId(tenantId),
      tenantId,
      tenantName: null,
      role: user.role,
    });
  }, [fetchBrowserEnterpriseContext, isDesktop, user]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      await loadPrefs();
      await refreshEnterpriseContext();
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadPrefs, refreshEnterpriseContext]);

  useEffect(() => {
    if (!isDesktop) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshEnterpriseContext();
      }, 400);
    };
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', scheduleRefresh);
    window.addEventListener('one-enterprise-context-refresh', scheduleRefresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', scheduleRefresh);
      window.removeEventListener('one-enterprise-context-refresh', scheduleRefresh);
    };
  }, [isDesktop, refreshEnterpriseContext]);

  const hasJoinedEnterprise = enterpriseContext?.joined === true;
  const effectiveRole = isDesktop
    ? enterpriseContext?.role ?? user?.role
    : user?.role ?? enterpriseContext?.role;

  const authEditionSyncedRef = useRef(false);
  const prevWebUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (loading || isDesktop) return;

    if (!authEditionSyncedRef.current) {
      authEditionSyncedRef.current = true;
      prevWebUserIdRef.current = user?.id;
      return;
    }

    const uid = user?.id;
    const userChanged = Boolean(uid && uid !== prevWebUserIdRef.current);
    prevWebUserIdRef.current = uid;

    if (userChanged && hasJoinedEnterprise && managementMode !== 'enterprise') {
      void persistEnterpriseWorkspaceEdition().then(() => {
        setManagementModeState('enterprise');
      });
    }
  }, [hasJoinedEnterprise, isDesktop, loading, managementMode, user?.id]);

  const prevJoinedDesktopRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isDesktop || loading) return;
    const prev = prevJoinedDesktopRef.current;
    prevJoinedDesktopRef.current = hasJoinedEnterprise;
    if (prev === null) return;
    if (!prev && hasJoinedEnterprise && managementMode !== 'enterprise') {
      void persistEnterpriseWorkspaceEdition().then(() => {
        setManagementModeState('enterprise');
      });
    }
  }, [hasJoinedEnterprise, isDesktop, loading, managementMode]);

  const setManagementMode = useCallback(async (mode: WebuiManagementMode) => {
    await ConfigStorage.set(WEBUI_MANAGEMENT_MODE_KEY, mode);
    setManagementModeState(mode);
  }, []);

  const openUrlInBrowser = useCallback(
    async (hashPath: string): Promise<'opened' | 'webui_not_running' | 'failed'> => {
      const base = (await getWebuiApiBaseUrl()) ?? webuiApiBase;
      if (!base) return 'webui_not_running';
      const url = `${base}/#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}`;
      try {
        if (isDesktop) {
          await openExternalUrl(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return 'opened';
      } catch {
        return 'failed';
      }
    },
    [isDesktop, webuiApiBase]
  );

  const openEnterpriseLoginInBrowser = useCallback(async (): Promise<'opened' | 'webui_not_running' | 'failed'> => {
    const landing = resolveEnterpriseEditionPath(hasJoinedEnterprise);
    setPostLoginRedirect(landing);
    return openUrlInBrowser(`/login?redirect=${encodeURIComponent(landing)}`);
  }, [hasJoinedEnterprise, openUrlInBrowser]);

  const openEnterpriseAdminInBrowser = useCallback(async (): Promise<'opened' | 'webui_not_running' | 'failed'> => {
    setPostLoginRedirect('/enterprise');
    return openUrlInBrowser('/enterprise');
  }, [openUrlInBrowser]);

  const showEnterpriseAdminNav = isEnterpriseAdminRole(effectiveRole);

  const canCreateEnterprise = enterpriseContext?.canCreateEnterprise === true;

  const joinWithInviteCode = useCallback(
    async (code: string) => {
      const result = await joinEnterpriseWithCode(code);
      await refreshAuth();
      await persistEnterpriseWorkspaceEdition();
      setManagementModeState('enterprise');
      await refreshEnterpriseContext();
      return result;
    },
    [refreshAuth, refreshEnterpriseContext]
  );

  const createEnterpriseOrganization = useCallback(
    async (name: string) => {
      await createEnterprise(name);
      await refreshAuth();
      await persistEnterpriseWorkspaceEdition();
      setManagementModeState('enterprise');
      await refreshEnterpriseContext();
    },
    [refreshAuth, refreshEnterpriseContext]
  );

  const value = useMemo<WebuiEnterpriseModeValue>(
    () => ({
      loading,
      hasJoinedEnterprise,
      effectiveRole,
      managementMode,
      enterpriseContext,
      showEnterpriseAdminNav,
      webuiApiBase,
      setManagementMode,
      refreshEnterpriseContext,
      openEnterpriseAdminInBrowser,
      openEnterpriseLoginInBrowser,
      canCreateEnterprise,
      joinWithInviteCode,
      createEnterpriseOrganization,
    }),
    [
      canCreateEnterprise,
      createEnterpriseOrganization,
      effectiveRole,
      enterpriseContext,
      hasJoinedEnterprise,
      joinWithInviteCode,
      loading,
      managementMode,
      openEnterpriseAdminInBrowser,
      openEnterpriseLoginInBrowser,
      refreshEnterpriseContext,
      setManagementMode,
      showEnterpriseAdminNav,
      webuiApiBase,
    ]
  );

  return <WebuiEnterpriseModeContext.Provider value={value}>{children}</WebuiEnterpriseModeContext.Provider>;
};

export function useWebuiEnterpriseMode(): WebuiEnterpriseModeValue {
  const ctx = useContext(WebuiEnterpriseModeContext);
  if (!ctx) {
    throw new Error('useWebuiEnterpriseMode must be used within WebuiEnterpriseModeProvider');
  }
  return ctx;
}
