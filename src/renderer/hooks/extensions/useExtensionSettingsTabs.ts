/**
 * Shared cache for extension-contributed settings tabs (dedupes IPC across SettingsSider + SettingsPageWrapper).
 */

import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useCallback, useEffect } from 'react';
import useSWR from 'swr';

const SETTINGS_TABS_KEY = 'extensions.settingsTabs';

async function fetchExtensionSettingsTabs(): Promise<IExtensionSettingsTab[]> {
  const maxAttempts = 20;
  const retryDelayCapMs = 300;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const tabs = (await extensionsIpc.getSettingsTabs.invoke()) ?? [];
      if (tabs.length > 0 || attempt === maxAttempts - 1) {
        return tabs;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) {
        throw error;
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, Math.min(100 * (attempt + 1), retryDelayCapMs)));
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

export function useExtensionSettingsTabs(): {
  extensionTabs: IExtensionSettingsTab[];
  refresh: () => Promise<IExtensionSettingsTab[] | undefined>;
} {
  const { data, mutate } = useSWR(SETTINGS_TABS_KEY, fetchExtensionSettingsTabs, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    onError: (err) => console.error('[useExtensionSettingsTabs] Failed to load extension settings tabs:', err),
  });

  const refresh = useCallback(() => mutate(), [mutate]);

  useEffect(() => {
    const unsubscribe = extensionsIpc.stateChanged.on(() => {
      void mutate();
    });
    return unsubscribe;
  }, [mutate]);

  return {
    extensionTabs: data ?? [],
    refresh,
  };
}
