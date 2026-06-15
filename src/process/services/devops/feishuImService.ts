/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FeishuProviderConfig } from '@process/webserver/auth/providers/FeishuAuthProvider';
import { AuthProviderRepository } from '@process/webserver/auth/repository/AuthProviderRepository';

const FEISHU_HTTP_TIMEOUT_MS = 12_000;

type FeishuApiResponse<T> = { code: number; msg?: string; data?: T };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FEISHU_HTTP_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getFeishuTenantAccessToken(): Promise<{ token: string; receiveIdType: 'open_id' | 'union_id' } | null> {
  const provider = await AuthProviderRepository.getProvider('feishu');
  if (!provider?.enabled) {
    return null;
  }
  const cfg = provider.config as FeishuProviderConfig;
  const appId = String(cfg.appId ?? process.env.FEISHU_APP_ID ?? '').trim();
  const appSecret = String(cfg.appSecret ?? process.env.FEISHU_APP_SECRET ?? '').trim();
  if (!appId || !appSecret) {
    return null;
  }

  const res = await fetchWithTimeout('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const json = (await res.json().catch((): null => null)) as FeishuApiResponse<{ tenant_access_token?: string }> | null;
  if (!res.ok || !json || json.code !== 0 || !json.data?.tenant_access_token) {
    return null;
  }

  const receiveIdType = (cfg.externalIdField ?? 'union_id') as 'open_id' | 'union_id';
  return { token: json.data.tenant_access_token, receiveIdType };
}

export async function sendFeishuTextMessage(input: {
  receiveId: string;
  receiveIdType: 'open_id' | 'union_id';
  text: string;
  tenantAccessToken: string;
}): Promise<boolean> {
  const url = new URL('https://open.feishu.cn/open-apis/im/v1/messages');
  url.searchParams.set('receive_id_type', input.receiveIdType);

  const res = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.tenantAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: input.receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text: input.text.slice(0, 4000) }),
    }),
  });

  const json = (await res.json().catch((): null => null)) as FeishuApiResponse<unknown> | null;
  if (!res.ok || !json || json.code !== 0) {
    console.warn('[FeishuIM] send message failed:', json?.msg ?? res.status);
    return false;
  }
  return true;
}
