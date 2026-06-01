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
import { syncBrowserWebuiSessionToDesktop } from '@/renderer/utils/syncBrowserWebuiSession';
import {
  createEnterprise,
  joinEnterpriseWithCode,
} from '@/renderer/utils/enterpriseJoinApi';
import { adminApi } from '@/renderer/utils/kanbanApi';
import {
  isEnterpriseAdminRole,
  isSystemAdminRole,
  resolveEnterpriseEditionPath,
} from '@/common/auth/enterpriseRoles';
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
  /** 侧栏 / 标题栏「管理后台」入口：系统管理员或未加入企业的组织管理员 */
  showEnterpriseAdminNav: boolean;
  /** 组织是否允许非系统管理员切换「企业团队版」模式（默认关闭） */
  editionSwitcherEnabled: boolean;
  /** 当前用户是否可在标题栏切换到企业团队版 */
  canUseEnterpriseEditionSwitcher: boolean;
  webuiApiBase: string | null;
  setManagementMode: (mode: WebuiManagementMode) => Promise<void>;
  refreshEnterpriseContext: () => Promise<void>;
  openEnterpriseAdminInBrowser: () => Promise<'opened' | 'webui_not_running' | 'failed'>;
  /** Opens WebUI login with post-login redirect to /enterprise (LDAP / Feishu / invite flow). */
  openEnterpriseLoginInBrowser: () => Promise<'opened' | 'webui_not_running' | 'failed'>;
  canCreateEnterprise: boolean;
  hasSystemAdmin: boolean;
  canClaimSystemAdmin: boolean;
  claimSystemAdmin: () => Promise<void>;
  joinWithInviteCode: (code: string) => Promise<EnterpriseJoinResult>;
  createEnterpriseOrganization: (name: string) => Promise<void>;
};

const WebuiEnterpriseModeContext = createContext<WebuiEnterpriseModeValue | null>(null);

export const WebuiEnterpriseModeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, refresh: refreshAuth } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const isDesktop = isElectronDesktop();
  const [loading, setLoading] = useState(true);
  const bootstrapGenerationRef = useRef(0);
  const [managementMode, setManagementModeState] = useState<WebuiManagementMode>(DEFAULT_WEBUI_MANAGEMENT_MODE);
  const [enterpriseContext, setEnterpriseContext] = useState<EnterpriseContextSnapshot | null>(null);
  const [webuiApiBase, setWebuiApiBase] = useState<string | null>(null);
  const [editionSwitcherEnabled, setEditionSwitcherEnabled] = useState(false);

  const loadEditionSwitcherFlag = useCallback(async () => {
    try {
      const res = await fetchWebuiApi('/api/auth/login-ui');
      const body = (await res.json().catch((): null => null)) as {
        success?: boolean;
        data?: { editionSwitcherEnabled?: boolean };
      };
      if (res.ok && body?.success) {
        setEditionSwitcherEnabled(Boolean(body.data?.editionSwitcherEnabled));
        return;
      }
    } catch {
      // ignore
    }
    setEditionSwitcherEnabled(false);
  }, []);

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

    const currentUser = userRef.current;
    if (!currentUser) {
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

    const tenantId = currentUser.tenant_id ?? 'default';
    setEnterpriseContext({
      joined: isEnterpriseTenantId(tenantId),
      tenantId,
      tenantName: null,
      role: currentUser.role,
    });
  }, [fetchBrowserEnterpriseContext, isDesktop]);

  useEffect(() => {
    const generation = ++bootstrapGenerationRef.current;
    const run = async () => {
      setLoading(true);
      try {
        await loadPrefs();
        await loadEditionSwitcherFlag();
        await refreshEnterpriseContext();
      } finally {
        if (bootstrapGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    };
    void run();
  }, [loadEditionSwitcherFlag, loadPrefs, refreshEnterpriseContext]);

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const uid = user?.id;
    if (!uid || uid === prevUserIdRef.current) {
      return;
    }
    const isIdentityChange = prevUserIdRef.current !== undefined;
    prevUserIdRef.current = uid;
    if (isIdentityChange) {
      void refreshEnterpriseContext();
    }
  }, [refreshEnterpriseContext, user?.id]);

  useEffect(() => {
    const onRefresh = () => {
      void loadEditionSwitcherFlag();
    };
    window.addEventListener('one-webui-config-refresh', onRefresh);
    return () => {
      window.removeEventListener('one-webui-config-refresh', onRefresh);
    };
  }, [loadEditionSwitcherFlag]);

  useEffect(() => {
    if (!isDesktop) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleFullRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void syncBrowserWebuiSessionToDesktop()
          .then(() => refreshAuth())
          .then(() => refreshEnterpriseContext());
      }, 400);
    };
    const handleEnterpriseContextRefresh = () => {
      void refreshEnterpriseContext();
    };
    window.addEventListener('focus', scheduleFullRefresh);
    document.addEventListener('visibilitychange', scheduleFullRefresh);
    window.addEventListener('one-enterprise-context-refresh', handleEnterpriseContextRefresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', scheduleFullRefresh);
      document.removeEventListener('visibilitychange', scheduleFullRefresh);
      window.removeEventListener('one-enterprise-context-refresh', handleEnterpriseContextRefresh);
    };
  }, [isDesktop, refreshAuth, refreshEnterpriseContext]);

  const hasJoinedEnterprise = enterpriseContext?.joined === true;
  const effectiveRole = isDesktop
    ? (enterpriseContext?.role ?? user?.role)
    : (user?.role ?? enterpriseContext?.role);

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
    setPostLoginRedirect('/enterprise/auth');
    return openUrlInBrowser('/login?redirect=%2Fenterprise%2Fauth&mode=enterprise');
  }, [openUrlInBrowser]);

  const showEnterpriseAdminNav = isEnterpriseAdminRole(effectiveRole);
  const canUseEnterpriseEditionSwitcher =
    editionSwitcherEnabled || isSystemAdminRole(effectiveRole);

  const canCreateEnterprise = enterpriseContext?.canCreateEnterprise === true;
  const hasSystemAdmin = enterpriseContext?.hasSystemAdmin === true;
  const canClaimSystemAdmin = enterpriseContext?.canClaimSystemAdmin === true;

  const claimSystemAdminRole = useCallback(async () => {
    await adminApi.claimSystemAdmin();
    await refreshAuth();
    await refreshEnterpriseContext();
    window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
  }, [refreshAuth, refreshEnterpriseContext]);

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
      editionSwitcherEnabled,
      canUseEnterpriseEditionSwitcher,
      webuiApiBase,
      setManagementMode,
      refreshEnterpriseContext,
      openEnterpriseAdminInBrowser,
      openEnterpriseLoginInBrowser,
      canCreateEnterprise,
      hasSystemAdmin,
      canClaimSystemAdmin,
      claimSystemAdmin: claimSystemAdminRole,
      joinWithInviteCode,
      createEnterpriseOrganization,
    }),
    [
      canClaimSystemAdmin,
      canCreateEnterprise,
      canUseEnterpriseEditionSwitcher,
      claimSystemAdminRole,
      createEnterpriseOrganization,
      hasSystemAdmin,
      editionSwitcherEnabled,
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
