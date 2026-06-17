/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { startOAuthAuthorize, type OAuthAuthorizeResult } from '@/renderer/utils/oauthAuthorize';

type FeishuQrLoginObj = {
  matchOrigin?: (origin: string) => boolean;
  matchData?: (data: unknown) => boolean;
};

type FeishuQrState = {
  sdkUrl: string;
  goto: string;
};

async function ensureScriptLoaded(src: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  const existing = document.querySelector(`script[data-one-feishu-qr="1"][src="${src}"]`);
  if (existing) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.oneFeishuQr = '1';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Feishu QR SDK')), { once: true });
    document.head.appendChild(script);
  });
}

export function useFeishuQrLogin(buildAuthorizePath: (mode: 'oauth' | 'qr') => string) {
  const [showQr, setShowQr] = useState(false);
  const [feishuQr, setFeishuQr] = useState<FeishuQrState | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const feishuListenerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const handleFeishuOauth = useCallback(async (): Promise<OAuthAuthorizeResult> => {
    setInitError(null);
    const result = await startOAuthAuthorize(buildAuthorizePath('oauth'));
    if (result.ok === false) {
      setInitError(result.message);
    }
    return result;
  }, [buildAuthorizePath]);

  const initFeishuQr = useCallback(async () => {
    setInitError(null);
    setFeishuQr(null);
    try {
      const path = buildAuthorizePath('qr');
      const res = isElectronDesktop() ? await fetchWebuiApi(path) : await fetch(path, { credentials: 'include' });
      const raw = (await res.json().catch((): null => null)) as unknown;
      const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
      const data = obj?.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null;
      if (!res.ok || obj?.success !== true || !data?.goto || !data?.sdkUrl) {
        throw new Error((obj?.message as string) ?? 'Failed to init Feishu QR');
      }

      const sdkUrl = String(data.sdkUrl);
      const goto = String(data.goto);
      await ensureScriptLoaded(sdkUrl);
      setFeishuQr({ sdkUrl, goto });
    } catch (error) {
      console.error('Failed to init Feishu QR:', error);
      setInitError(error instanceof Error ? error.message : 'Failed to init Feishu QR');
    }
  }, [buildAuthorizePath]);

  useEffect(() => {
    if (!showQr) {
      setFeishuQr(null);
      if (feishuListenerRef.current) {
        window.removeEventListener('message', feishuListenerRef.current);
        feishuListenerRef.current = null;
      }
      return;
    }
    void initFeishuQr();
    return () => {
      if (feishuListenerRef.current) {
        window.removeEventListener('message', feishuListenerRef.current);
        feishuListenerRef.current = null;
      }
    };
  }, [initFeishuQr, showQr]);

  useEffect(() => {
    if (!showQr || !feishuQr?.goto) {
      return;
    }
    const QRLogin = (window as unknown as { QRLogin?: (opts: unknown) => unknown }).QRLogin;
    if (!QRLogin) {
      return;
    }

    const containerId = 'one-feishu-qr-container';
    const obj = QRLogin({
      id: containerId,
      goto: feishuQr.goto,
      width: '260',
      height: '300',
      style: 'width:260px;height:300px;margin:0 auto;',
    }) as FeishuQrLoginObj;

    const handler = (event: MessageEvent) => {
      try {
        if (obj?.matchOrigin?.(event.origin) && obj?.matchData?.(event.data)) {
          const d = event.data as unknown;
          const tmpCode =
            d && typeof d === 'object' && 'tmp_code' in (d as Record<string, unknown>)
              ? (d as Record<string, unknown>).tmp_code
              : null;
          if (tmpCode) {
            const target = `${feishuQr.goto}&tmp_code=${encodeURIComponent(String(tmpCode))}`;
            if (isElectronDesktop()) {
              void openExternalUrl(target);
            } else {
              window.location.href = target;
            }
          }
        }
      } catch {
        // ignore malformed postMessage payloads
      }
    };
    feishuListenerRef.current = handler;
    window.addEventListener('message', handler);

    return () => {
      window.removeEventListener('message', handler);
      feishuListenerRef.current = null;
    };
  }, [feishuQr, showQr]);

  return {
    showQr,
    setShowQr,
    feishuQr,
    initError,
    handleFeishuOauth,
  };
}
