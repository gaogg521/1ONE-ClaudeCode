/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDingTalkAppCredentials, buildDingTalkAuthorizeUrl, resolveDingTalkExternalId } from '@/process/webserver/auth/providers/DingTalkAuthProvider';
import {
  testWeComAppCredentials,
  buildWeComAuthorizeUrl,
  fetchWeComUserIdByOAuthCode,
} from '@/process/webserver/auth/providers/WeComAuthProvider';

describe('DingTalkAuthProvider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errcode: 0, access_token: 'token' }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates app key and secret via gettoken', async () => {
    await expect(testDingTalkAppCredentials('key', 'secret')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects masked secret placeholder', async () => {
    await expect(testDingTalkAppCredentials('key', '******')).rejects.toThrow(/required/i);
  });
});

describe('WeComAuthProvider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errcode: 0, access_token: 'token' }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates corp id and secret via gettoken', async () => {
    await expect(testWeComAppCredentials('corp', 'secret')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('builds authorize URL with corp id, agent id, and redirect', () => {
    const url = buildWeComAuthorizeUrl({
      corpId: 'ww123',
      agentId: '1000002',
      redirectUri: 'https://example.com/api/auth/wecom/callback',
      state: 'abc',
    });
    expect(url).toContain('open.weixin.qq.com/connect/oauth2/authorize');
    expect(url).toContain('appid=ww123');
    expect(url).toContain('agentid=1000002');
    expect(url).toContain(encodeURIComponent('https://example.com/api/auth/wecom/callback'));
    expect(url).toContain('state=abc');
    expect(url).toContain('#wechat_redirect');
  });

  it('resolves user id from oauth code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errcode: 0, UserId: 'zhangsan' }), { status: 200 })
      )
    );
    await expect(fetchWeComUserIdByOAuthCode('token', 'code')).resolves.toBe('zhangsan');
  });
});

describe('DingTalk OAuth helpers', () => {
  it('builds authorize URL with app key and redirect', () => {
    const url = buildDingTalkAuthorizeUrl({
      appKey: 'ding123',
      redirectUri: 'https://example.com/api/auth/dingtalk/callback',
      state: 'xyz',
    });
    expect(url).toContain('login.dingtalk.com/oauth2/auth');
    expect(url).toContain('client_id=ding123');
    expect(url).toContain(encodeURIComponent('https://example.com/api/auth/dingtalk/callback'));
    expect(url).toContain('state=xyz');
  });

  it('resolves unionId by default', () => {
    expect(resolveDingTalkExternalId({ unionId: 'u1', openId: 'o1' }, 'unionId')).toBe('u1');
    expect(resolveDingTalkExternalId({ openId: 'o1' }, 'unionId')).toBe('o1');
  });
});
