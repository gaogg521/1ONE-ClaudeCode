/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { isElectronDesktop } from '@/renderer/utils/platform';
import { fetchWebuiApi, getWebuiApiBaseUrl } from '@/renderer/utils/webuiApiBase';
import {
  createEnterprise,
  joinEnterpriseWithCode,
} from '@/renderer/utils/enterpriseJoinApi';
import type { EnterpriseJoinResult } from '@/common/types/enterpriseJoin';

type UseWebuiEnterpriseModeResult = {
  loading: boolean;
  hasJoinedEnterprise: boolean;
  managementMode: WebuiManagementMode;
  enterpriseContext: EnterpriseContextSnapshot | null;
  showEnterpriseSettingsNav: boolean;
  webuiApiBase: string | null;
  setManagementMode: (mode: WebuiManagementMode) => Promise<void>;
  refreshEnterpriseContext: () => Promise<void>;
  openEnterpriseAdminInBrowser: () => Promise<void>;
  canCreateEnterprise: boolean;
  joinWithInviteCode: (code: string) => Promise<EnterpriseJoinResult>;
  createEnterpriseOrganization: (name: string) => Promise<void>;
};

export function useWebuiEnterpriseMode(): UseWebuiEnterpriseModeResult {
  const { user, refresh: refreshAuth } = useAuth();
  const isDesktop = isElectronDesktop();
  const [loading, setLoading] = useState(true);
  const [managementMode, setManagementModeState] = useState<WebuiManagementMode>(DEFAULT_WEBUI_MANAGEMENT_MODE);
  const [enterpriseContext, setEnterpriseContext] = useState<EnterpriseContextSnapshot | null>(null);
  const [webuiApiBase, setWebuiApiBase] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    const stored = await ConfigStorage.get(WEBUI_MANAGEMENT_MODE_KEY).catch(() => undefined);
    setManagementModeState(normalizeWebuiManagementMode(stored));
  }, []);

  const refreshEnterpriseContext = useCallback(async () => {
    const base = await getWebuiApiBaseUrl();
    setWebuiApiBase(base);

    if (isDesktop) {
      try {
        const result = await webui.getEnterpriseContext.invoke();
        if (result.success && result.data) {
          setEnterpriseContext(result.data);
          return;
        }
      } catch {
        // fall through
      }
      setEnterpriseContext({ joined: false, tenantId: 'default', tenantName: null, canCreateEnterprise: false });
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
      joined: tenantId !== 'default',
      tenantId,
      tenantName: null,
    });
  }, [isDesktop, user]);

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

  const hasJoinedEnterprise = enterpriseContext?.joined === true;

  useEffect(() => {
    if (!hasJoinedEnterprise && managementMode === 'enterprise') {
      void ConfigStorage.set(WEBUI_MANAGEMENT_MODE_KEY, 'standalone');
      setManagementModeState('standalone');
    }
  }, [hasJoinedEnterprise, managementMode]);

  const setManagementMode = useCallback(
    async (mode: WebuiManagementMode) => {
      const next = hasJoinedEnterprise ? mode : 'standalone';
      await ConfigStorage.set(WEBUI_MANAGEMENT_MODE_KEY, next);
      setManagementModeState(next);
    },
    [hasJoinedEnterprise]
  );

  const openEnterpriseAdminInBrowser = useCallback(async () => {
    const base = (await getWebuiApiBaseUrl()) ?? webuiApiBase;
    if (!base) return;
    const url = `${base}/#/settings/enterprise/users`;
    if (isDesktop && window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [isDesktop, webuiApiBase]);

  const showEnterpriseSettingsNav = useMemo(() => {
    if (!hasJoinedEnterprise || managementMode !== 'enterprise') return false;
    return !isDesktop;
  }, [hasJoinedEnterprise, isDesktop, managementMode]);

  const canCreateEnterprise = enterpriseContext?.canCreateEnterprise === true;

  const joinWithInviteCode = useCallback(
    async (code: string) => {
      const result = await joinEnterpriseWithCode(code);
      if (!isDesktop) {
        await refreshAuth();
      }
      await refreshEnterpriseContext();
      return result;
    },
    [isDesktop, refreshAuth, refreshEnterpriseContext]
  );

  const createEnterpriseOrganization = useCallback(
    async (name: string) => {
      await createEnterprise(name);
      if (!isDesktop) {
        await refreshAuth();
      }
      await ConfigStorage.set(WEBUI_MANAGEMENT_MODE_KEY, 'enterprise');
      setManagementModeState('enterprise');
      await refreshEnterpriseContext();
    },
    [isDesktop, refreshAuth, refreshEnterpriseContext]
  );

  return {
    loading,
    hasJoinedEnterprise,
    managementMode,
    enterpriseContext,
    showEnterpriseSettingsNav,
    webuiApiBase,
    setManagementMode,
    refreshEnterpriseContext,
    openEnterpriseAdminInBrowser,
    canCreateEnterprise,
    joinWithInviteCode,
    createEnterpriseOrganization,
  };
}
