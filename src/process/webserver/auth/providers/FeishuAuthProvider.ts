/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type FeishuProviderConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  externalIdField?: 'union_id' | 'open_id';
};

export type FeishuUserInfo = {
  name?: string;
  en_name?: string;
  open_id?: string;
  union_id?: string;
  tenant_key?: string;
  avatar_url?: string;
};

type FeishuApiResponse<T> = { code: number; msg?: string; data?: T };

function asFeishuResponse<T>(value: unknown): FeishuApiResponse<T> | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.code !== 'number') return null;
  return obj as FeishuApiResponse<T>;
}

export function buildFeishuAuthorizeUrl(input: {
    appId: string;
    redirectUri: string;
    state: string;
    // QRConnect uses same authorize URL; the QR SDK will append tmp_code later.
    // We keep the URL format stable for both flows.
    base?: string;
  }): string {
  const base = input.base ?? 'https://passport.feishu.cn/suite/passport/oauth/authorize';
  const url = new URL(base);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);
  return url.toString();
}

export async function exchangeFeishuCodeForUserAccessToken(params: {
    appId: string;
    appSecret: string;
    code: string;
  }): Promise<string> {
    const res = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: params.appId,
        client_secret: params.appSecret,
        code: params.code,
      }),
    });
    const data = (await res.json().catch((): null => null)) as unknown;
    const obj = asFeishuResponse<{ access_token?: string }>(data);
    if (!res.ok || !obj) {
      throw new Error(`Feishu token exchange failed: HTTP ${res.status}`);
    }
    if (obj.code !== 0) {
      throw new Error(`Feishu token exchange failed: ${obj.msg || 'unknown error'}`);
    }
    const token = obj.data?.access_token;
    if (typeof token !== 'string' || !token) {
      throw new Error('Feishu token exchange failed: missing access_token');
    }
    return token;
  }

export async function fetchFeishuUserInfo(userAccessToken: string): Promise<FeishuUserInfo> {
    const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
    const data = (await res.json().catch((): null => null)) as unknown;
    const obj = asFeishuResponse<FeishuUserInfo>(data);
    if (!res.ok || !obj) {
      throw new Error(`Feishu user_info failed: HTTP ${res.status}`);
    }
    if (obj.code !== 0) {
      throw new Error(`Feishu user_info failed: ${obj.msg || 'unknown error'}`);
    }
    return obj.data ?? {};
  }

export function resolveFeishuExternalId(
  info: FeishuUserInfo,
  field: 'union_id' | 'open_id' = 'union_id'
): string | null {
  const v = field === 'open_id' ? info.open_id : info.union_id;
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  // fallback
  const fallback = field === 'open_id' ? info.union_id : info.open_id;
  if (typeof fallback === 'string' && fallback.trim() !== '') return fallback.trim();
  return null;
}

/** Validates App ID + App Secret by requesting a tenant access token (no user OAuth). */
export async function testFeishuAppCredentials(appId: string, appSecret: string): Promise<void> {
  const id = String(appId ?? '').trim();
  const secret = String(appSecret ?? '').trim();
  if (!id || !secret || secret === '******') {
    throw new Error('App ID and App Secret are required for connection test');
  }
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: id, app_secret: secret }),
  });
  const data = (await res.json().catch((): null => null)) as unknown;
  const obj = asFeishuResponse<{ tenant_access_token?: string }>(data);
  if (!res.ok || !obj) {
    throw new Error(`Feishu API error: HTTP ${res.status}`);
  }
  if (obj.code !== 0) {
    throw new Error(obj.msg || 'Feishu tenant token request failed');
  }
}

