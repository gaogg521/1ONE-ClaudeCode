/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';

export type LoginUiProviderFlags = {
  ldapEnabled: boolean;
  feishuEnabled: boolean;
  dingtalkEnabled: boolean;
  wecomEnabled: boolean;
  ldapConfigured: boolean;
  feishuConfigured: boolean;
  dingtalkConfigured: boolean;
  wecomConfigured: boolean;
  editionSwitcherEnabled?: boolean;
};

export type LoginUiMode = 'standalone' | 'enterprise';

export type LoginUiProvidersState = LoginUiProviderFlags & {
  loading: boolean;
  mode: LoginUiMode;
  error: 'none' | 'db_unavailable' | 'load_failed';
  anyProviderEnabled: boolean;
  anyProviderConfigured: boolean;
  refresh: () => void;
};

const EMPTY_FLAGS: LoginUiProviderFlags = {
  ldapEnabled: false,
  feishuEnabled: false,
  dingtalkEnabled: false,
  wecomEnabled: false,
  ldapConfigured: false,
  feishuConfigured: false,
  dingtalkConfigured: false,
  wecomConfigured: false,
  editionSwitcherEnabled: false,
};

export function useLoginUiProviders(): LoginUiProvidersState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoginUiProvidersState['error']>('none');
  const [mode, setMode] = useState<LoginUiMode>('standalone');
  const [flags, setFlags] = useState<LoginUiProviderFlags>(EMPTY_FLAGS);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchWebuiApi('/api/auth/login-ui');
        const body = (await res.json()) as {
          success?: boolean;
          code?: string;
          data?: Partial<LoginUiProviderFlags> & { mode?: LoginUiMode };
        };

        if (cancelled) {
          return;
        }

        if (!res.ok || body?.success === false) {
          setError(body?.code === 'db_unavailable' ? 'db_unavailable' : 'load_failed');
          setMode('standalone');
          setFlags(EMPTY_FLAGS);
          return;
        }

        setError('none');
        const data = body.data ?? {};
        const ldapEnabled = Boolean(data.ldapEnabled);
        const feishuEnabled = Boolean(data.feishuEnabled);
        const dingtalkEnabled = Boolean(data.dingtalkEnabled);
        const wecomEnabled = Boolean(data.wecomEnabled);
        const resolvedMode: LoginUiMode =
          data.mode === 'enterprise' || ldapEnabled || feishuEnabled || dingtalkEnabled || wecomEnabled
            ? 'enterprise'
            : 'standalone';
        setMode(resolvedMode);
        setFlags({
          ldapEnabled: Boolean(data.ldapEnabled),
          feishuEnabled: Boolean(data.feishuEnabled),
          dingtalkEnabled: Boolean(data.dingtalkEnabled),
          wecomEnabled: Boolean(data.wecomEnabled),
          ldapConfigured: Boolean(data.ldapConfigured),
          feishuConfigured: Boolean(data.feishuConfigured),
          dingtalkConfigured: Boolean(data.dingtalkConfigured),
          wecomConfigured: Boolean(data.wecomConfigured),
          editionSwitcherEnabled: Boolean(data.editionSwitcherEnabled),
        });
      } catch (loadError) {
        if (!cancelled) {
          if (loadError instanceof Error && loadError.message === 'WEBUI_NOT_RUNNING') {
            setError('load_failed');
          } else {
            setError('load_failed');
          }
          setMode('standalone');
          setFlags(EMPTY_FLAGS);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    const handleRefresh = () => {
      refresh();
    };
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('one-enterprise-context-refresh', handleRefresh);
    window.addEventListener('one-webui-config-refresh', handleRefresh);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('one-enterprise-context-refresh', handleRefresh);
      window.removeEventListener('one-webui-config-refresh', handleRefresh);
    };
  }, [refresh]);

  return useMemo(() => {
    const anyProviderEnabled =
      flags.ldapEnabled || flags.feishuEnabled || flags.dingtalkEnabled || flags.wecomEnabled;
    const anyProviderConfigured =
      flags.ldapConfigured ||
      flags.feishuConfigured ||
      flags.dingtalkConfigured ||
      flags.wecomConfigured;

    return {
      loading,
      mode,
      error,
      ...flags,
      anyProviderEnabled,
      anyProviderConfigured,
      refresh,
    };
  }, [error, flags, loading, mode, refresh]);
};
