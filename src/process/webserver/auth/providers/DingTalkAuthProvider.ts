/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '@process/webserver/auth/providers/providerHttp';

export type DingTalkProviderConfig = {
  appKey: string;
  appSecret: string;
  corpId?: string;
  redirectUri?: string;
  externalIdField?: 'unionId' | 'openId';
};

type DingTalkLegacyTokenResponse = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
};

type DingTalkUserTokenResponse = {
  accessToken?: string;
  refreshToken?: string;
  expireIn?: number;
  corpId?: string;
};

export type DingTalkUserInfo = {
  unionId?: string;
  openId?: string;
  nick?: string;
  mobile?: string;
};

const DINGTALK_OAUTH_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth';

export function buildDingTalkAuthorizeUrl(input: { appKey: string; redirectUri: string; state: string }): string {
  const url = new URL(DINGTALK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.appKey);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', input.state);
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export async function exchangeDingTalkCodeForUserAccessToken(params: {
  appKey: string;
  appSecret: string;
  code: string;
}): Promise<string> {
  const res = await fetchWithTimeout('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: params.appKey,
      clientSecret: params.appSecret,
      code: params.code,
      grantType: 'authorization_code',
    }),
  });
  const data = (await res.json().catch((): null => null)) as DingTalkUserTokenResponse | null;
  if (!res.ok || !data?.accessToken) {
    throw new Error(`DingTalk token exchange failed: HTTP ${res.status}`);
  }
  return data.accessToken;
}

export async function fetchDingTalkUserInfo(accessToken: string): Promise<DingTalkUserInfo> {
  const res = await fetchWithTimeout('https://api.dingtalk.com/v1.0/contact/users/me', {
    method: 'GET',
    headers: {
      'x-acs-dingtalk-access-token': accessToken,
    },
  });
  const data = (await res.json().catch((): null => null)) as DingTalkUserInfo | null;
  if (!res.ok || !data) {
    throw new Error(`DingTalk user info failed: HTTP ${res.status}`);
  }
  return data;
}

export function resolveDingTalkExternalId(
  info: DingTalkUserInfo,
  field: 'unionId' | 'openId' = 'unionId'
): string | null {
  const primary = field === 'openId' ? info.openId : info.unionId;
  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim();
  }
  const fallback = field === 'openId' ? info.unionId : info.openId;
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }
  return null;
}

/** Validates AppKey + AppSecret via DingTalk gettoken (no user OAuth). */
export async function testDingTalkAppCredentials(appKey: string, appSecret: string): Promise<void> {
  const key = String(appKey ?? '').trim();
  const secret = String(appSecret ?? '').trim();
  if (!key || !secret || secret === '******') {
    throw new Error('AppKey and AppSecret are required for connection test');
  }

  const url = new URL('https://oapi.dingtalk.com/gettoken');
  url.searchParams.set('appkey', key);
  url.searchParams.set('appsecret', secret);

  const res = await fetchWithTimeout(url.toString(), { method: 'GET' });
  const data = (await res.json().catch((): null => null)) as DingTalkLegacyTokenResponse | null;
  if (!res.ok || !data) {
    throw new Error(`DingTalk API error: HTTP ${res.status}`);
  }
  if (data.errcode !== 0) {
    throw new Error(data.errmsg || 'DingTalk token request failed');
  }
  if (!data.access_token) {
    throw new Error('DingTalk token request failed: missing access_token');
  }
}
