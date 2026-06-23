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
  WEBUI_USER_CHOSE_STANDALONE_KEY,
  normalizeWebuiManagementMode,
  readBrowserWebuiManagementMode,
  writeBrowserWebuiManagementMode,
} from '@/common/config/webuiEnterpriseConfig';
import { isDesktopOperatorUser, useAuth } from '@/renderer/hooks/context/AuthContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { fetchWebuiApi, getWebuiAdminBrowserOrigin, getWebuiApiBaseUrl } from '@/renderer/utils/webuiApiBase';
import { buildWebuiAdminLoginUrl } from '@/common/config/webuiLoginAccess';
import { ENTERPRISE_ADMIN_HOME_PATH } from '@/common/auth/enterpriseRoles';
import {
  getDesktopWebuiBearerToken,
  syncBrowserWebuiSessionToDesktop,
} from '@/renderer/utils/syncBrowserWebuiSession';
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
import { buildEnterpriseLoginPath, readCurrentHashPath } from '@/renderer/utils/enterpriseLoginNavigation';
import type { EnterpriseJoinResult } from '@/common/types/enterpriseJoin';

export type WebuiEnterpriseModeValue = {
  loading: boolean;
  hasInstanceEnterprise: boolean;
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
  /** Desktop: navigate in-app; browser WebUI: open system browser. */
  startEnterpriseLogin: (navigate: (path: string) => void, returnTo?: string) => Promise<void>;
  buildEnterpriseLoginPath: (returnTo?: string) => string;
  canCreateEnterprise: boolean;
  hasSystemAdmin: boolean;
  canClaimSystemAdmin: boolean;
  claimSystemAdmin: () => Promise<void>;
  joinWithInviteCode: (code: string) => Promise<EnterpriseJoinResult>;
  createEnterpriseOrganization: (name: string) => Promise<void>;
};

const WebuiEnterpriseModeContext = createContext<WebuiEnterpriseModeValue | null>(null);

const ENTERPRISE_BOOTSTRAP_TIMEOUT_MS = 8_000;

async function withEnterpriseBootstrapTimeout<T>(promise: Promise<T>, label: string): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[WebuiEnterpriseMode] ${label} timed out after ${ENTERPRISE_BOOTSTRAP_TIMEOUT_MS}ms`);
          resolve(undefined);
        }, ENTERPRISE_BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(`[WebuiEnterpriseMode] ${label} failed:`, error);
    return undefined;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

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
    if (!isDesktop) {
      setManagementModeState(readBrowserWebuiManagementMode() ?? DEFAULT_WEBUI_MANAGEMENT_MODE);
      return;
    }
    const stored = await ConfigStorage.get(WEBUI_MANAGEMENT_MODE_KEY).catch((): undefined => undefined);
    setManagementModeState(normalizeWebuiManagementMode(stored));
  }, [isDesktop]);

  const fetchBrowserEnterpriseContext = useCallback(async (): Promise<EnterpriseContextSnapshot | null> => {
    if (!getDesktopWebuiBearerToken()) {
      return null;
    }
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
        await withEnterpriseBootstrapTimeout(loadPrefs(), 'loadPrefs');
        await withEnterpriseBootstrapTimeout(loadEditionSwitcherFlag(), 'loadEditionSwitcherFlag');
        await withEnterpriseBootstrapTimeout(refreshEnterpriseContext(), 'refreshEnterpriseContext');
      } finally {
        if (bootstrapGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    };
    void run();
  }, [loadEditionSwitcherFlag, loadPrefs, refreshEnterpriseContext]);

  useEffect(() => {
    const safetyTimer = window.setTimeout(() => {
      setLoading(false);
    }, ENTERPRISE_BOOTSTRAP_TIMEOUT_MS + 4_000);
    return () => {
      window.clearTimeout(safetyTimer);
    };
  }, []);

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

  const desktopSyncInFlightRef = useRef(false);

  useEffect(() => {
    if (!isDesktop) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleFullRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (desktopSyncInFlightRef.current) {
          return;
        }
        desktopSyncInFlightRef.current = true;
        const runDesktopSync = async () => {
          await syncBrowserWebuiSessionToDesktop();
          if (getDesktopWebuiBearerToken()) {
            await refreshAuth();
          }
          await refreshEnterpriseContext();
        };
        // 整条链加超时兜底：任一步骤卡死时，超时后仍会复位 in-flight 标志，
        // 否则一次挂起（如 DB/cookie 卡顿）会让标志永远为 true，永久禁用后续焦点同步。
        // withEnterpriseBootstrapTimeout 内部已吞错并打日志，同步失败/超时不会冒泡为未捕获 rejection。
        void withEnterpriseBootstrapTimeout(runDesktopSync(), 'desktopFocusSync').finally(() => {
          desktopSyncInFlightRef.current = false;
        });
      }, 800);
    };
    const handleEnterpriseContextRefresh = () => {
      if (desktopSyncInFlightRef.current) {
        return;
      }
      void withEnterpriseBootstrapTimeout(refreshEnterpriseContext(), 'enterpriseContextRefresh');
    };
    const shouldSkipBackgroundSync = (): boolean => {
      if (typeof window === 'undefined') {
        return false;
      }
      const hash = window.location.hash.replace(/^#/, '');
      return hash.startsWith('/super-assistant');
    };
    const scheduleFullRefreshIfNeeded = () => {
      if (shouldSkipBackgroundSync()) {
        return;
      }
      scheduleFullRefresh();
    };
    window.addEventListener('focus', scheduleFullRefreshIfNeeded);
    document.addEventListener('visibilitychange', scheduleFullRefreshIfNeeded);
    window.addEventListener('one-enterprise-context-refresh', handleEnterpriseContextRefresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', scheduleFullRefreshIfNeeded);
      document.removeEventListener('visibilitychange', scheduleFullRefreshIfNeeded);
      window.removeEventListener('one-enterprise-context-refresh', handleEnterpriseContextRefresh);
    };
  }, [isDesktop, refreshAuth, refreshEnterpriseContext]);

  const joinedByInstanceContext = enterpriseContext?.joined === true;
  const joinedByUserIdentity =
    Boolean(user && !isDesktopOperatorUser(user) && isEnterpriseTenantId(user.tenant_id));
  const hasInstanceEnterprise = joinedByInstanceContext;
  const hasJoinedEnterprise = joinedByUserIdentity;
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

    if (userChanged && joinedByUserIdentity && managementMode !== 'enterprise') {
      void (async () => {
        const choseStandalone = await ConfigStorage.get(WEBUI_USER_CHOSE_STANDALONE_KEY).catch(
          (): undefined => undefined
        );
        if (choseStandalone === true) {
          return;
        }
        await persistEnterpriseWorkspaceEdition();
        setManagementModeState('enterprise');
      })();
    }
  }, [isDesktop, joinedByUserIdentity, loading, managementMode, user?.id]);

  const prevJoinedDesktopRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isDesktop || loading) return;
    const prev = prevJoinedDesktopRef.current;
    prevJoinedDesktopRef.current = joinedByUserIdentity;
    if (prev === null) return;
    if (!prev && joinedByUserIdentity && managementMode !== 'enterprise') {
      void (async () => {
        const choseStandalone = await ConfigStorage.get(WEBUI_USER_CHOSE_STANDALONE_KEY).catch(
          (): undefined => undefined
        );
        if (choseStandalone === true) {
          return;
        }
        await persistEnterpriseWorkspaceEdition();
        setManagementModeState('enterprise');
      })();
    }
  }, [isDesktop, joinedByUserIdentity, loading, managementMode]);

  const setManagementMode = useCallback(async (mode: WebuiManagementMode) => {
    setManagementModeState(mode);
    if (!isDesktop) {
      writeBrowserWebuiManagementMode(mode);
      return;
    }
    try {
      await ConfigStorage.set(WEBUI_MANAGEMENT_MODE_KEY, mode);
      await ConfigStorage.set(WEBUI_USER_CHOSE_STANDALONE_KEY, mode === 'standalone');
    } catch {
      const stored = await ConfigStorage.get(WEBUI_MANAGEMENT_MODE_KEY).catch((): undefined => undefined);
      setManagementModeState(normalizeWebuiManagementMode(stored));
    }
  }, [isDesktop]);

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

  const buildEnterpriseLoginPathForContext = useCallback(
    (returnTo?: string) => buildEnterpriseLoginPath(returnTo ?? readCurrentHashPath()),
    []
  );

  const openEnterpriseLoginInBrowser = useCallback(async (): Promise<'opened' | 'webui_not_running' | 'failed'> => {
    const landing = resolveEnterpriseEditionPath(hasJoinedEnterprise);
    setPostLoginRedirect(landing);
    const result = await openUrlInBrowser(buildEnterpriseLoginPath(landing));
    if (result === 'opened' && isDesktop) {
      const synced = await syncBrowserWebuiSessionToDesktop();
      if (synced?.token) {
        await refreshAuth();
        await refreshEnterpriseContext();
        window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
      }
    }
    return result;
  }, [hasJoinedEnterprise, isDesktop, openUrlInBrowser, refreshAuth, refreshEnterpriseContext]);

  const startEnterpriseLogin = useCallback(
    async (navigate: (path: string) => void, returnTo?: string) => {
      const loginPath = buildEnterpriseLoginPath(returnTo ?? readCurrentHashPath());
      if (isDesktop) {
        navigate(loginPath);
        return;
      }
      await openEnterpriseLoginInBrowser();
    },
    [isDesktop, openEnterpriseLoginInBrowser]
  );

  const openEnterpriseAdminInBrowser = useCallback(async (): Promise<'opened' | 'webui_not_running' | 'failed'> => {
    setPostLoginRedirect(ENTERPRISE_ADMIN_HOME_PATH);
    const adminOrigin = await getWebuiAdminBrowserOrigin();
    if (!adminOrigin) {
      return 'webui_not_running';
    }
    const url = buildWebuiAdminLoginUrl(adminOrigin, ENTERPRISE_ADMIN_HOME_PATH);
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
  }, [isDesktop]);

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
      hasInstanceEnterprise,
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
      startEnterpriseLogin,
      buildEnterpriseLoginPath: buildEnterpriseLoginPathForContext,
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
      hasInstanceEnterprise,
      hasJoinedEnterprise,
      joinWithInviteCode,
      loading,
      managementMode,
      openEnterpriseAdminInBrowser,
      openEnterpriseLoginInBrowser,
      startEnterpriseLogin,
      buildEnterpriseLoginPathForContext,
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
