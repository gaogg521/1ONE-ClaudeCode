/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '@process/webserver/auth/providers/providerHttp';

export type WeComProviderConfig = {
  corpId: string;
  agentId: string;
  secret: string;
  redirectUri?: string;
};

type WeComTokenResponse = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
};

type WeComUserInfoResponse = {
  errcode?: number;
  errmsg?: string;
  UserId?: string;
  OpenId?: string;
  external_userid?: string;
};

const WECOM_OAUTH_AUTHORIZE_URL = 'https://open.weixin.qq.com/connect/oauth2/authorize';

export function buildWeComAuthorizeUrl(input: {
  corpId: string;
  agentId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(WECOM_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('appid', input.corpId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'snsapi_base');
  url.searchParams.set('state', input.state);
  url.searchParams.set('agentid', input.agentId);
  return `${url.toString()}#wechat_redirect`;
}

export async function fetchWeComCorpAccessToken(corpId: string, secret: string): Promise<string> {
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
  url.searchParams.set('corpid', corpId);
  url.searchParams.set('corpsecret', secret);
  const res = await fetchWithTimeout(url.toString(), { method: 'GET' });
  const data = (await res.json().catch((): null => null)) as WeComTokenResponse | null;
  if (!res.ok || !data) {
    throw new Error(`WeCom API error: HTTP ${res.status}`);
  }
  if (data.errcode !== 0) {
    throw new Error(data.errmsg || 'WeCom token request failed');
  }
  if (!data.access_token) {
    throw new Error('WeCom token request failed: missing access_token');
  }
  return data.access_token;
}

export async function fetchWeComUserIdByOAuthCode(accessToken: string, code: string): Promise<string> {
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo');
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('code', code);
  const res = await fetchWithTimeout(url.toString(), { method: 'GET' });
  const data = (await res.json().catch((): null => null)) as WeComUserInfoResponse | null;
  if (!res.ok || !data) {
    throw new Error(`WeCom user info failed: HTTP ${res.status}`);
  }
  if (data.errcode !== 0) {
    throw new Error(data.errmsg || 'WeCom user info failed');
  }
  const userId = data.UserId?.trim();
  if (!userId) {
    throw new Error('WeCom user info failed: missing UserId');
  }
  return userId;
}

/** Validates CorpId + app Secret via WeCom gettoken (no user OAuth). */
export async function testWeComAppCredentials(corpId: string, secret: string): Promise<void> {
  await fetchWeComCorpAccessToken(corpId, secret);
}
