/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { applySsoCallbackSession } from '@/renderer/utils/webuiDesktopSession';
import { rememberEnterpriseApiOrigin } from '@/renderer/utils/rememberEnterpriseApiOrigin';

/**
 * Deep link event payload from main process
 */
export type DeepLinkPayload = {
  action: string;
  params: Record<string, string>;
};

export type DeepLinkAddProviderDetail = {
  baseUrl?: string;
  apiKey?: string;
  name?: string;
  platform?: string;
};

/** Pending deep link data for the add-provider action. Read-once: consumed by ModelModalContent on mount. */
let pendingDeepLinkData: DeepLinkAddProviderDetail | null = null;

/**
 * Consume (read and clear) pending deep link data.
 * Returns the data if present, or null. Subsequent calls return null until new data arrives.
 */
export const consumePendingDeepLink = (): DeepLinkAddProviderDetail | null => {
  const data = pendingDeepLinkData;
  pendingDeepLinkData = null;
  return data;
};

/**
 * Hook to listen for 1ONE ClaudeCode:// deep link events from main process.
 * Routes 'add-provider' action to the model settings page.
 * The pre-fill data is stored in a module-level variable and consumed
 * by ModelModalContent on mount via consumePendingDeepLink().
 */
export const useDeepLink = () => {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const handler = useCallback(
    async (payload: DeepLinkPayload) => {
      // Support both formats: "add-provider" and "provider/add" (one-api style)
      if (payload.action === 'add-provider' || payload.action === 'provider/add') {
        pendingDeepLinkData = {
          baseUrl: payload.params.baseUrl || payload.params.base_url,
          apiKey: payload.params.apiKey || payload.params.api_key || payload.params.key,
          name: payload.params.name,
          platform: payload.params.platform,
        };

        // Navigate to model settings page; ModelModalContent will pick up the pending data
        void navigate('/settings/model');
        return;
      }

      // Client-mode desktop SSO callback: enterprise server redirected the
      // system browser here after OAuth completed. Seed the local session from
      // the token passed via deep link, then refresh auth + navigate to workspace.
      if (payload.action === 'sso-callback') {
        const session = applySsoCallbackSession(payload.params);
        if (!session) {
          return;
        }
        const origin = payload.params.origin?.trim();
        if (origin) {
          try {
            await rememberEnterpriseApiOrigin(origin);
          } catch {
            // best-effort — session is already set, origin remember failure is recoverable
          }
        }
        try {
          await refresh();
        } catch {
          // refresh failure is recoverable — session is already in sessionStorage
        }
        window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
        const target = payload.params.redirect?.trim() || '/guid';
        navigate(target);
        return;
      }
    },
    [navigate, refresh]
  );

  useEffect(() => {
    return ipcBridge.deepLink.received.on(handler);
  }, [handler]);
};
