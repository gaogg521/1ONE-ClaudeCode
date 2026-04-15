/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import { isProviderLiteLlmProxy } from '@/common/utils/litellmGateway';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { getGeminiModeList, type GeminiModeOption } from './useModeModeList';

/**
 * True when at least one enabled model provider may use Google OAuth / Vertex native flows.
 * OpenAI-compatible gateways (e.g. LiteLLM with authType `openai`) must NOT trigger this —
 * avoids background `googleAuth.status` / subscription calls that read ~/.gemini OAuth cache.
 */
function anyProviderNeedsGoogleSidecar(providers: unknown): boolean {
  if (!Array.isArray(providers)) return false;
  return (providers as IProvider[]).some((p) => {
    if (p.enabled === false) return false;
    if (isProviderLiteLlmProxy(p)) return false;
    const pl = (p.platform || '').toLowerCase();
    if (pl.includes('gemini-with-google-auth')) return true;
    const maybeUseModel = (p as unknown as { useModel?: string }).useModel;
    return (
      getProviderAuthType({
        platform: p.platform,
        authType: p.authType,
        authTypeCustom: p.authTypeCustom,
        modelProtocols: p.modelProtocols,
        useModel: maybeUseModel,
        model: p.model,
        baseUrl: p.baseUrl,
        name: p.name,
        litellmProxy: p.litellmProxy,
      }) === 'vertex'
    );
  });
}

export interface GeminiGoogleAuthModelResult {
  geminiModeOptions: GeminiModeOption[];
  isGoogleAuth: boolean;
  subscriptionStatus?: {
    isSubscriber: boolean;
    tier?: string;
    lastChecked: number;
    message?: string;
  };
}

export const useGeminiGoogleAuthModels = (): GeminiGoogleAuthModelResult => {
  const { t } = useTranslation();
  const { data: geminiConfig } = useSWR('gemini.config', () => ConfigStorage.get('gemini.config'));
  const proxyKey = geminiConfig?.proxy || '';

  const { data: modelConfig } = useSWR('model.config.shared', () => ipcBridge.mode.getModelConfig.invoke());
  const pollGoogleSidecar = useMemo(() => anyProviderNeedsGoogleSidecar(modelConfig), [modelConfig]);

  // Only touch Google OAuth when a provider actually needs Vertex / Google-auth CLI flows.
  // Pure OpenAI-protocol gateways (LiteLLM, etc.) must not invoke googleAuth.status (no log noise, no ~/.gemini reads).
  const googleAuthSwrKey = pollGoogleSidecar ? `google.auth.status|${proxyKey}` : null;
  const { data: isGoogleAuth } = useSWR(googleAuthSwrKey, async () => {
    const data = await ipcBridge.googleAuth.status.invoke({ proxy: geminiConfig?.proxy });
    return data.success;
  });

  const shouldCheckSubscription = pollGoogleSidecar && Boolean(isGoogleAuth);

  // 仅在通过认证后才触发订阅状态查询。Only hit CLI subscription API when authenticated.
  const subscriptionKey = shouldCheckSubscription ? 'gemini.subscription.status' + proxyKey : null;
  const { data: subscriptionResponse } = useSWR(subscriptionKey, () => {
    return ipcBridge.gemini.subscriptionStatus.invoke({ proxy: geminiConfig?.proxy });
  });

  // 生成与终端 CLI 一致的模型列表 / Generate model list matching terminal CLI
  const descriptions = useMemo(
    () => ({
      autoGemini3: t(
        'gemini.mode.autoGemini3Desc',
        'Let Gemini CLI decide the best model for the task: gemini-3.1-pro-preview, gemini-3-flash'
      ),
      autoGemini25: t(
        'gemini.mode.autoGemini25Desc',
        'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash'
      ),
      manual: t('gemini.mode.manualDesc', 'Manually select a model'),
    }),
    [t]
  );
  const geminiModeOptions = useMemo(() => getGeminiModeList({ descriptions }), [descriptions]);

  return {
    geminiModeOptions,
    isGoogleAuth: Boolean(isGoogleAuth),
    subscriptionStatus: subscriptionResponse?.data,
  };
};
