/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { AuthMiddleware } from '@process/webserver/auth/middleware/AuthMiddleware';
import { UserRepository, type AuthUser } from '@process/webserver/auth/repository/UserRepository';
import { AuthProviderRepository } from '@process/webserver/auth/repository/AuthProviderRepository';
import { DB_UNAVAILABLE_RESPONSE, isDatabaseUnavailableError } from '@process/services/database/errors';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import type { AuthProviderType } from '@process/services/database/types';
import { AUTH_CONFIG, getCookieOptions } from '../config/constants';
import { TokenUtils } from '@process/webserver/auth/middleware/TokenMiddleware';
import { createAppError } from '../middleware/errorHandler';
import { authRateLimiter, authenticatedActionLimiter, apiRateLimiter } from '../middleware/security';
import { verifyQRTokenDirect } from '@process/bridge/webuiQR';
import { authenticateWithLdap, type LdapProviderConfig } from '../auth/providers/LdapAuthProvider';
import { resolveEnterpriseContext } from '../auth/enterpriseContext';
import { getInstanceGovernance } from '../auth/instanceGovernance';
import {
  EnterpriseJoinError,
  joinEnterpriseWithInvite,
  previewEnterpriseInvite,
} from '../auth/enterpriseJoinService';
import {
  buildFeishuAuthorizeUrl,
  exchangeFeishuCodeForUserAccessToken,
  fetchFeishuUserInfo,
  resolveFeishuExternalId,
  type FeishuProviderConfig,
} from '../auth/providers/FeishuAuthProvider';
import {
  buildDingTalkAuthorizeUrl,
  exchangeDingTalkCodeForUserAccessToken,
  fetchDingTalkUserInfo,
  resolveDingTalkExternalId,
  type DingTalkProviderConfig,
} from '../auth/providers/DingTalkAuthProvider';
import {
  buildWeComAuthorizeUrl,
  fetchWeComCorpAccessToken,
  fetchWeComUserIdByOAuthCode,
  type WeComProviderConfig,
} from '../auth/providers/WeComAuthProvider';
import { resolvePostLoginRedirectPath } from '@/common/auth/enterpriseRoles';
import { readRequestOrigin, resolveOAuthCallbackUri } from '@/common/auth/oauthCallbackUri';
import { fetchFeishuOrgUnitPath } from '../auth/orgProfile/feishuOrgProfile';
import { updateUserOrgProfile } from '@process/services/user/userProfileService';
import {
  registerBrowserWebuiLoginSession,
  registerBrowserSessionFromRequest,
} from '../auth/registerBrowserWebuiLoginSession';
import { revokeBrowserWebuiSession } from '../auth/browserSessionBridge';
import { getOrgEditionSettings } from '../auth/orgEditionSettings';
import {
  cleanupOAuthLoginState,
  consumeOAuthLoginState,
  DEFAULT_POST_LOGIN_TARGET,
  OAUTH_STATE_INVALID_MESSAGE,
  issueOAuthLoginState,
} from '../auth/oauthLoginState';
import {
  finalizeOAuthBrowserLogin,
  respondOAuthProviderUnavailable,
  sendOAuthAuthorizeRedirect,
} from '../auth/oauthLoginHelpers';
import { refreshUserAfterEnterpriseAutoJoin } from '../auth/enterpriseAutoJoin';
import { resolveOrProvisionLdapUser, resolveOrProvisionSsoUser } from '../auth/ssoJitProvisioning';

const FEISHU_QR_SDK_URL =
  'https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.3.js';

function normalizePostLoginTarget(raw: unknown): string {
  if (typeof raw !== 'string') {
    return DEFAULT_POST_LOGIN_TARGET;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) {
    return DEFAULT_POST_LOGIN_TARGET;
  }
  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return DEFAULT_POST_LOGIN_TARGET;
  }
  return trimmed;
}

function normalizeWebRole(role: string | undefined): 'member' | 'org_admin' | 'system_admin' {
  if (!role) return 'member';
  if (role === 'admin') return 'system_admin';
  if (role === 'user') return 'member';
  if (role === 'system_admin' || role === 'org_admin' || role === 'member') return role;
  return 'member';
}

function buildAuthResponseUser(
  user: Pick<AuthUser, 'id' | 'username' | 'tenant_id' | 'role'>,
  roleOverride?: string
): {
  id: string;
  username: string;
  role: 'member' | 'org_admin' | 'system_admin';
  tenant_id: string;
} {
  return {
    id: user.id,
    username: user.username,
    role: normalizeWebRole(roleOverride ?? user.role),
    tenant_id: user.tenant_id ?? 'default',
  };
}

/**
 * QR 登录页面 HTML（静态，不包含用户输入）
 * QR login page HTML (static, no user input embedded)
 * JavaScript 直接从 URL 参数读取 token，避免 XSS
 * JavaScript reads token directly from URL params to prevent XSS
 */
const QR_LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QR Login - 1ONE ClaudeCode</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
    .loading { color: #3498db; font-size: 18px; }
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { margin-bottom: 16px; }
    p { color: #666; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container" id="content">
    <div class="spinner"></div>
    <p class="loading">Verifying... / 验证中...</p>
  </div>
  <script>
    (async function() {
      var container = document.getElementById('content');
      var params = new URLSearchParams(window.location.search);
      var qrToken = params.get('token');
      if (!qrToken) {
        container.innerHTML = '<h2 class="error">Invalid QR Code</h2><p>The QR code is invalid or missing.</p><p>二维码无效或缺失。</p>';
        return;
      }
      try {
        var response = await fetch('/api/auth/qr-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrToken: qrToken }),
          credentials: 'include'
        });
        var data = await response.json();
        if (data.success) {
          container.innerHTML = '<h2 class="success">Login Successful!</h2><p>Redirecting... / 登录成功，正在跳转...</p>';
          setTimeout(function() { window.location.href = '/'; }, 1000);
        } else {
          // XSS 安全修复：使用 textContent 而非 innerHTML 插入错误消息
          // XSS Security fix: Use textContent instead of innerHTML for error message
          var h2 = document.createElement('h2');
          h2.className = 'error';
          h2.textContent = 'Login Failed';
          var p1 = document.createElement('p');
          p1.textContent = data.error || 'QR code expired or invalid';
          var p2 = document.createElement('p');
          p2.textContent = '二维码已过期或无效，请重新扫描。';
          container.innerHTML = '';
          container.appendChild(h2);
          container.appendChild(p1);
          container.appendChild(p2);
        }
      } catch (e) {
        container.innerHTML = '<h2 class="error">Error</h2><p>Network error. Please try again.</p><p>网络错误，请重试。</p>';
      }
    })();
  </script>
</body>
</html>`;

/**
 * 注册认证相关路由
 * Register authentication routes
 */
export function registerAuthRoutes(app: Express): void {
  /**
   * 获取当前启用的认证提供方（不包含敏感配置）
   * GET /api/auth/providers
   */
  app.get('/api/auth/providers', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      const providers = await AuthProviderRepository.listProviders();
      res.json({ success: true, data: providers });
    } catch (error) {
      console.error('[AuthRoute] providers error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 登录页 UI 模式：单机 WebUI（仅本地 admin）vs 企业版（LDAP/飞书等）
   * GET /api/auth/login-ui
   */
  app.get('/api/auth/login-ui', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      const rows = await AuthProviderRepository.listProviders();
      const ldapRow = rows.find((p) => p.provider === 'ldap');
      const feishuRow = rows.find((p) => p.provider === 'feishu');
      const dingtalkRow = rows.find((p) => p.provider === 'dingtalk');
      const wecomRow = rows.find((p) => p.provider === 'wecom');
      const ldapEnabled = Boolean(ldapRow?.enabled);
      const feishuEnabled = Boolean(feishuRow?.enabled);
      const dingtalkEnabled = Boolean(dingtalkRow?.enabled);
      const wecomEnabled = Boolean(wecomRow?.enabled);
      const ldapConfigured = Boolean(ldapRow?.hasConfig);
      const feishuConfigured = Boolean(feishuRow?.hasConfig);
      const dingtalkConfigured = Boolean(dingtalkRow?.hasConfig);
      const wecomConfigured = Boolean(wecomRow?.hasConfig);
      const editionSettings = await getOrgEditionSettings();
      const mode =
        ldapEnabled || feishuEnabled || dingtalkEnabled || wecomEnabled ? 'enterprise' : 'standalone';
      res.json({
        success: true,
        data: {
          mode,
          ldapEnabled,
          feishuEnabled,
          dingtalkEnabled,
          wecomEnabled,
          ldapConfigured,
          feishuConfigured,
          dingtalkConfigured,
          wecomConfigured,
          editionSwitcherEnabled: editionSettings.editionSwitcherEnabled,
        },
      });
    } catch (error) {
      console.error('[AuthRoute] login-ui error:', error);
      if (isDatabaseUnavailableError(error)) {
        res.status(503).json(DB_UNAVAILABLE_RESPONSE);
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 飞书授权入口
   * - mode=oauth: 直接 302 跳转到授权页
   * - mode=qr: 返回 goto URL，前端配合 QR SDK 生成二维码
   */
  app.get('/api/auth/feishu/authorize', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      cleanupOAuthLoginState('feishu');
      const mode = String(req.query.mode ?? 'oauth');

      const providerRow = await AuthProviderRepository.getProvider('feishu');
      const cfg = (providerRow?.config ?? {}) as unknown as FeishuProviderConfig;
      const appId = cfg.appId || process.env.FEISHU_APP_ID || '';
      const redirectUri = resolveOAuthCallbackUri(
        String(cfg.redirectUri ?? process.env.FEISHU_REDIRECT_URI ?? ''),
        '/api/auth/feishu/callback',
        readRequestOrigin(req)
      );
      const hasSecret = Boolean(String(cfg.appSecret ?? '').trim() || process.env.FEISHU_APP_SECRET);
      const hasMinimalConfig = Boolean(appId && redirectUri && hasSecret);

      if (!providerRow || !hasMinimalConfig) {
        respondOAuthProviderUnavailable(res, {
          providerLabel: 'Feishu',
          configured: false,
          enabled: Boolean(providerRow?.enabled),
        });
        return;
      }
      if (!providerRow.enabled) {
        respondOAuthProviderUnavailable(res, {
          providerLabel: 'Feishu',
          configured: true,
          enabled: false,
        });
        return;
      }

      const redirectTarget = normalizePostLoginTarget(req.query.redirect);
      const state = issueOAuthLoginState('feishu', redirectTarget);
      const goto = buildFeishuAuthorizeUrl({ appId, redirectUri, state });

      if (mode === 'qr') {
        res.json({ success: true, data: { sdkUrl: FEISHU_QR_SDK_URL, goto, state } });
        return;
      }

      sendOAuthAuthorizeRedirect(res, req, goto);
    } catch (error) {
      console.error('[AuthRoute] feishu authorize error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 飞书回调
   * GET /api/auth/feishu/callback?code=...&state=...
   */
  app.get('/api/auth/feishu/callback', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      if (!code || !state) {
        res.status(400).send('Missing code/state');
        return;
      }
      const stateEntry = consumeOAuthLoginState('feishu', state);
      if (!stateEntry) {
        res.status(400).send(OAUTH_STATE_INVALID_MESSAGE);
        return;
      }

      const providerRow = await AuthProviderRepository.getProvider('feishu');
      const cfg = (providerRow?.config ?? {}) as unknown as FeishuProviderConfig;
      const appId = cfg.appId || process.env.FEISHU_APP_ID || '';
      const appSecret = cfg.appSecret || process.env.FEISHU_APP_SECRET || '';
      const redirectUri = resolveOAuthCallbackUri(
        String(cfg.redirectUri ?? process.env.FEISHU_REDIRECT_URI ?? ''),
        '/api/auth/feishu/callback',
        readRequestOrigin(req)
      );
      if (!providerRow?.enabled) {
        res.status(404).send('Feishu login is not enabled');
        return;
      }
      if (!appId || !appSecret) {
        res.status(500).send('Feishu provider not configured');
        return;
      }

      const token = await exchangeFeishuCodeForUserAccessToken({ appId, appSecret, code, redirectUri });
      const userInfo = await fetchFeishuUserInfo(token);
      const externalIdField = (cfg.externalIdField ?? 'union_id') as 'union_id' | 'open_id';
      const externalId = resolveFeishuExternalId(userInfo, externalIdField);
      if (!externalId) {
        res.status(500).send('Failed to resolve Feishu user identity');
        return;
      }

      let orgUnitPath: string | null = null;
      try {
        const openId = typeof userInfo.open_id === 'string' ? userInfo.open_id.trim() : '';
        if (openId) {
          orgUnitPath = await fetchFeishuOrgUnitPath({ appId, appSecret, openId });
        }
      } catch (syncError) {
        console.warn('[AuthRoute] feishu org profile sync failed:', syncError);
      }

      const displayName = String(userInfo.name ?? userInfo.en_name ?? '').trim();
      const { user } = await resolveOrProvisionSsoUser('feishu', {
        externalId,
        preferredUsername: displayName || `feishu_${externalId.slice(0, 16)}`,
        orgUnitPath,
        orgSource: 'feishu',
      });

      await finalizeOAuthBrowserLogin(req, res, {
        user,
        redirectTarget: stateEntry.redirectTarget,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const normalized = msg.trim();
      if (msg.toLowerCase().includes('invalid_grant')) {
        res.status(400).send('Feishu auth code expired or invalid. Please retry login.');
        return;
      }
      if (msg.toLowerCase().includes('timeout')) {
        res.status(504).send('Feishu login timeout. Please retry.');
        return;
      }
      if (
        normalized.startsWith('Feishu token exchange failed:') ||
        normalized.startsWith('Feishu user_info failed:')
      ) {
        const detail = normalized.replace(/^Feishu (token exchange|user_info) failed:\s*/u, '').trim();
        res.status(400).send(`Feishu login failed: ${detail || 'upstream request failed'}`);
        return;
      }
      console.error('[AuthRoute] feishu callback error:', error);
      res.status(500).send('Internal server error');
    }
  });

  /**
   * 钉钉授权入口
   * GET /api/auth/dingtalk/authorize
   */
  app.get('/api/auth/dingtalk/authorize', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      cleanupOAuthLoginState('dingtalk');
      const providerRow = await AuthProviderRepository.getProvider('dingtalk');
      const cfg = (providerRow?.config ?? {}) as unknown as DingTalkProviderConfig;
      const appKey = String(cfg.appKey ?? '').trim();
      const appSecret = String(cfg.appSecret ?? '').trim();
      const redirectUri = resolveOAuthCallbackUri(
        String(cfg.redirectUri ?? process.env.DINGTALK_REDIRECT_URI ?? ''),
        '/api/auth/dingtalk/callback',
        readRequestOrigin(req)
      );
      const hasMinimalConfig = Boolean(appKey && appSecret && redirectUri);

      if (!providerRow || !hasMinimalConfig) {
        respondOAuthProviderUnavailable(res, {
          providerLabel: 'DingTalk',
          configured: false,
          enabled: Boolean(providerRow?.enabled),
        });
        return;
      }
      if (!providerRow.enabled) {
        respondOAuthProviderUnavailable(res, {
          providerLabel: 'DingTalk',
          configured: true,
          enabled: false,
        });
        return;
      }

      const redirectTarget = normalizePostLoginTarget(req.query.redirect);
      const state = issueOAuthLoginState('dingtalk', redirectTarget);
      const goto = buildDingTalkAuthorizeUrl({ appKey, redirectUri, state });
      sendOAuthAuthorizeRedirect(res, req, goto);
    } catch (error) {
      console.error('[AuthRoute] dingtalk authorize error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 钉钉回调
   * GET /api/auth/dingtalk/callback?code=...&state=...
   */
  app.get('/api/auth/dingtalk/callback', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      if (!code || !state) {
        res.status(400).send('Missing code/state');
        return;
      }
      const stateEntry = consumeOAuthLoginState('dingtalk', state);
      if (!stateEntry) {
        res.status(400).send(OAUTH_STATE_INVALID_MESSAGE);
        return;
      }

      const providerRow = await AuthProviderRepository.getProvider('dingtalk');
      const cfg = (providerRow?.config ?? {}) as unknown as DingTalkProviderConfig;
      const appKey = String(cfg.appKey ?? '').trim();
      const appSecret = String(cfg.appSecret ?? '').trim();
      if (!providerRow?.enabled) {
        res.status(404).send('DingTalk login is not enabled');
        return;
      }
      if (!appKey || !appSecret) {
        res.status(500).send('DingTalk provider not configured');
        return;
      }

      const accessToken = await exchangeDingTalkCodeForUserAccessToken({ appKey, appSecret, code });
      const userInfo = await fetchDingTalkUserInfo(accessToken);
      const externalIdField = (cfg.externalIdField ?? 'unionId') as 'unionId' | 'openId';
      const externalId = resolveDingTalkExternalId(userInfo, externalIdField);
      if (!externalId) {
        res.status(500).send('Failed to resolve DingTalk user identity');
        return;
      }

      const nick = String(userInfo.nick ?? '').trim();
      const mobile = String(userInfo.mobile ?? '').trim();
      const { user } = await resolveOrProvisionSsoUser('dingtalk', {
        externalId,
        preferredUsername: nick || mobile || `dingtalk_${externalId.slice(0, 16)}`,
      });

      await finalizeOAuthBrowserLogin(req, res, {
        user,
        redirectTarget: stateEntry.redirectTarget,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const normalized = msg.trim();
      if (
        normalized.startsWith('DingTalk token exchange failed:') ||
        normalized.startsWith('DingTalk user info failed:')
      ) {
        const detail = normalized.replace(/^DingTalk (token exchange|user info) failed:\s*/u, '').trim();
        res.status(400).send(`DingTalk login failed: ${detail || 'upstream request failed'}`);
        return;
      }
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired')) {
        res.status(400).send('DingTalk auth code expired or invalid. Please retry login.');
        return;
      }
      if (msg.toLowerCase().includes('timeout')) {
        res.status(504).send('DingTalk login timeout. Please retry.');
        return;
      }
      console.error('[AuthRoute] dingtalk callback error:', error);
      res.status(500).send('Internal server error');
    }
  });

  /**
   * 企业微信授权入口
   * GET /api/auth/wecom/authorize
   */
  app.get('/api/auth/wecom/authorize', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      cleanupOAuthLoginState('wecom');
      const providerRow = await AuthProviderRepository.getProvider('wecom');
      const cfg = (providerRow?.config ?? {}) as unknown as WeComProviderConfig;
      const corpId = String(cfg.corpId ?? '').trim();
      const agentId = String(cfg.agentId ?? '').trim();
      const secret = String(cfg.secret ?? '').trim();
      const redirectUri = resolveOAuthCallbackUri(
        String(cfg.redirectUri ?? process.env.WECOM_REDIRECT_URI ?? ''),
        '/api/auth/wecom/callback',
        readRequestOrigin(req)
      );
      const hasMinimalConfig = Boolean(corpId && agentId && secret && redirectUri);

      if (!providerRow || !hasMinimalConfig) {
        respondOAuthProviderUnavailable(res, {
          providerLabel: 'WeCom',
          configured: false,
          enabled: Boolean(providerRow?.enabled),
        });
        return;
      }
      if (!providerRow.enabled) {
        respondOAuthProviderUnavailable(res, {
          providerLabel: 'WeCom',
          configured: true,
          enabled: false,
        });
        return;
      }

      const redirectTarget = normalizePostLoginTarget(req.query.redirect);
      const state = issueOAuthLoginState('wecom', redirectTarget);
      const goto = buildWeComAuthorizeUrl({ corpId, agentId, redirectUri, state });
      sendOAuthAuthorizeRedirect(res, req, goto);
    } catch (error) {
      console.error('[AuthRoute] wecom authorize error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 企业微信回调
   * GET /api/auth/wecom/callback?code=...&state=...
   */
  app.get('/api/auth/wecom/callback', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      if (!code || !state) {
        res.status(400).send('Missing code/state');
        return;
      }
      const stateEntry = consumeOAuthLoginState('wecom', state);
      if (!stateEntry) {
        res.status(400).send(OAUTH_STATE_INVALID_MESSAGE);
        return;
      }

      const providerRow = await AuthProviderRepository.getProvider('wecom');
      const cfg = (providerRow?.config ?? {}) as unknown as WeComProviderConfig;
      const corpId = String(cfg.corpId ?? '').trim();
      const secret = String(cfg.secret ?? '').trim();
      if (!providerRow?.enabled) {
        res.status(404).send('WeCom login is not enabled');
        return;
      }
      if (!corpId || !secret) {
        res.status(500).send('WeCom provider not configured');
        return;
      }

      const accessToken = await fetchWeComCorpAccessToken(corpId, secret);
      const externalId = await fetchWeComUserIdByOAuthCode(accessToken, code);

      const { user } = await resolveOrProvisionSsoUser('wecom', {
        externalId,
        preferredUsername: `wecom_${externalId}`,
      });

      await finalizeOAuthBrowserLogin(req, res, {
        user,
        redirectTarget: stateEntry.redirectTarget,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const normalized = msg.trim();
      if (
        normalized.startsWith('WeCom token request failed:') ||
        normalized.startsWith('WeCom user info failed:')
      ) {
        const detail = normalized.replace(/^WeCom (token request|user info) failed:\s*/u, '').trim();
        res.status(400).send(`WeCom login failed: ${detail || 'upstream request failed'}`);
        return;
      }
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired')) {
        res.status(400).send('WeCom auth code expired or invalid. Please retry login.');
        return;
      }
      if (msg.toLowerCase().includes('timeout')) {
        res.status(504).send('WeCom login timeout. Please retry.');
        return;
      }
      console.error('[AuthRoute] wecom callback error:', error);
      res.status(500).send('Internal server error');
    }
  });

  /**
   * 用户登录 - Login endpoint
   * POST /login
   */
  // Login attempts are strictly rate limited to defend against brute force
  // 登录尝试严格限流，防止暴力破解
  app.post('/login', authRateLimiter, AuthMiddleware.validateLoginInput, async (req: Request, res: Response) => {
    try {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : req.body.username;
      const { password } = req.body;

      // Get user from database
      const user = await UserRepository.findByUsername(username);
      if (!user) {
        // Use constant time verification to prevent timing attacks
        await AuthService.constantTimeVerifyMissingUser();
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
        return;
      }

      // Verify password with constant time
      const isValidPassword = await AuthService.constantTimeVerify(password, user.password_hash, true);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
        return;
      }

      const joinedUser = await refreshUserAfterEnterpriseAutoJoin(user);

      const token = await AuthService.generateToken({
        id: joinedUser.id,
        username: joinedUser.username,
        role: joinedUser.role,
      });

      await UserRepository.updateLastLogin(joinedUser.id);

      res.cookie(AUTH_CONFIG.COOKIE.NAME, token, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });
      registerBrowserWebuiLoginSession(req, joinedUser, token);

      res.json({
        success: true,
        message: 'Login successful',
        user: buildAuthResponseUser(joinedUser),
        token,
      });
    } catch (error) {
      console.error('Login error:', error);
      if (isDatabaseUnavailableError(error)) {
        res.status(503).json(DB_UNAVAILABLE_RESPONSE);
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * LDAP 登录（域控账号）
   * POST /api/auth/ldap/login
   *
   * 说明：首次 LDAP 登录会自动 JIT 开通本地账号并绑定身份；重复登录走已绑定用户。
   */
  app.post('/api/auth/ldap/login', authRateLimiter, AuthMiddleware.validateLoginInput, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body as { username: string; password: string };
      const provider: AuthProviderType = 'ldap';
      const providerRow = await AuthProviderRepository.getProvider(provider);
      if (!providerRow || !providerRow.enabled) {
        res.status(404).json({ success: false, message: 'LDAP login is not enabled' });
        return;
      }

      const cfg = providerRow.config as unknown as LdapProviderConfig;
      if (!cfg?.url || !cfg?.baseDN) {
        res.status(500).json({ success: false, message: 'LDAP provider not configured' });
        return;
      }

      const result = await authenticateWithLdap(username, password, cfg);

      const { user, isAdmin } = await resolveOrProvisionLdapUser(username, {
        externalId: result.externalId,
        isAdmin: result.isAdmin,
        orgUnitPath: result.orgUnitPath,
      });

      const joinedUser = await refreshUserAfterEnterpriseAutoJoin(user);

      const effectiveRole = isAdmin ? 'system_admin' : normalizeWebRole(joinedUser.role);
      if (isAdmin && joinedUser.role !== 'system_admin') {
        try {
          await UserRepository.setRole(joinedUser.id, 'system_admin');
        } catch (roleError) {
          console.warn('[AuthRoute] failed to persist LDAP admin role:', roleError);
        }
      }
      const token = await AuthService.generateToken({
        id: joinedUser.id,
        username: joinedUser.username,
        role: effectiveRole,
      });

      await UserRepository.updateLastLogin(joinedUser.id);
      res.cookie(AUTH_CONFIG.COOKIE.NAME, token, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });
      registerBrowserWebuiLoginSession(req, joinedUser, token, effectiveRole);

      res.json({
        success: true,
        message: 'Login successful',
        user: buildAuthResponseUser(joinedUser, effectiveRole),
        token,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      const lower = msg.toLowerCase();
      const code = String(error?.code ?? '').toUpperCase();
      if (
        lower.includes('invalidcredentials') ||
        lower.includes('invalid credentials') ||
        lower.includes('user not found')
      ) {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
        return;
      }
      if (
        lower.includes('timeout') ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === 'ECONNRESET' ||
        code === 'ENOTFOUND'
      ) {
        res.status(503).json({ success: false, message: 'LDAP service unavailable. Please retry later.' });
        return;
      }
      console.error('[AuthRoute] ldap login error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * 用户登出 - Logout endpoint
   * POST /logout
   */
  // Authenticated endpoints reuse shared limiter keyed by user/IP
  // 已登录接口复用按用户/IP 计数的限流器
  app.post(
    '/logout',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    (req: Request, res: Response) => {
      // 将当前 token 加入黑名单 / Blacklist current token
      const token = TokenUtils.extractFromRequest(req);
      if (token) {
        AuthService.blacklistToken(token);
        revokeBrowserWebuiSession(token);
      }

      res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      res.json({ success: true, message: 'Logged out successfully' });
    }
  );

  /**
   * Enterprise membership for the signed-in user (tenant !== default).
   * GET /api/auth/enterprise-context
   */
  app.get(
    '/api/auth/enterprise-context',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    async (req: Request, res: Response) => {
      const tenantId = req.user?.tenant_id;
      const data = await resolveEnterpriseContext(tenantId);
      const joined = data.joined;
      const governance = await getInstanceGovernance(req.user?.role);
      res.json({
        success: true,
        data: {
          ...data,
          role: req.user?.role,
          canCreateEnterprise: !joined && req.user?.role === 'system_admin',
          hasSystemAdmin: governance.hasSystemAdmin,
          canClaimSystemAdmin: governance.canClaimSystemAdmin,
        },
      });
    }
  );

  /**
   * Preview enterprise invite code (tenant name only).
   * GET /api/auth/enterprise-invite/preview?code=
   */
  app.get(
    '/api/auth/enterprise-invite/preview',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const code = String(req.query.code ?? '');
        const data = await previewEnterpriseInvite(code);
        res.json({ success: true, data });
      } catch (err) {
        if (err instanceof EnterpriseJoinError) {
          res.status(400).json({ success: false, code: err.code, message: err.message });
          return;
        }
        console.error('[AuthRoute] enterprise invite preview error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  /**
   * Join an enterprise with invite code.
   * POST /api/auth/enterprise-join
   */
  app.post(
    '/api/auth/enterprise-join',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    async (req: Request, res: Response) => {
      try {
        const code = String((req.body as { code?: unknown })?.code ?? '');
        const data = await joinEnterpriseWithInvite(req.user!.id, code);
        res.json({ success: true, data });
      } catch (err) {
        if (err instanceof EnterpriseJoinError) {
          const status = err.code === 'FORBIDDEN' ? 403 : 400;
          res.status(status).json({ success: false, code: err.code, message: err.message });
          return;
        }
        console.error('[AuthRoute] enterprise join error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  /**
   * 获取认证状态 - Get authentication status
   * GET /api/auth/status
   */
  // Rate limit auth status endpoint to prevent enumeration
  // 为认证状态端点添加速率限制以防止枚举攻击
  app.get('/api/auth/status', apiRateLimiter, (_req: Request, res: Response) => {
    Promise.all([UserRepository.hasUsers(), UserRepository.countUsers()])
      .then(([hasUsers, userCount]) => {
        res.json({
          success: true,
          needsSetup: !hasUsers,
          userCount,
          isAuthenticated: false, // Will be determined by frontend based on token
        });
      })
      .catch((error) => {
        console.error('Auth status error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      });
  });

  /**
   * 获取当前用户信息 - Get current user (protected route)
   * GET /api/auth/user
   */
  // Add rate limiting for authenticated user info endpoint
  // 为已认证用户信息端点添加速率限制
  app.get(
    '/api/auth/user',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    (req: Request, res: Response) => {
      if (req.user) {
        registerBrowserSessionFromRequest(req, req.user, req.user.role);
      }
      res.json({
        success: true,
        user: req.user,
      });
    }
  );

  /**
   * 修改密码 - Change password endpoint (protected route)
   * POST /api/auth/change-password
   */
  app.post(
    '/api/auth/change-password',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    async (req: Request, res: Response) => {
      try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
          res.status(400).json({
            success: false,
            error: 'Current password and new password are required',
          });
          return;
        }

        // Validate new password strength
        const passwordValidation = AuthService.validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
          res.status(400).json({
            success: false,
            error: 'New password does not meet security requirements',
            details: passwordValidation.errors,
          });
          return;
        }

        // Get current user
        const user = await UserRepository.findById(req.user!.id);
        if (!user) {
          res.status(404).json({
            success: false,
            error: 'User not found',
          });
          return;
        }

        // Verify current password
        const isValidPassword = await AuthService.verifyPassword(currentPassword, user.password_hash);
        if (!isValidPassword) {
          res.status(401).json({
            success: false,
            error: 'Current password is incorrect',
          });
          return;
        }

        // Hash new password
        const newPasswordHash = await AuthService.hashPassword(newPassword);

        // Update password
        await UserRepository.updatePassword(user.id, newPasswordHash);
        await AuthService.invalidateAllTokens();

        res.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * Token 刷新 - Token refresh endpoint
   * POST /api/auth/refresh
   */
  app.post('/api/auth/refresh', apiRateLimiter, authenticatedActionLimiter, (req: Request, res: Response) => {
    void (async () => {
      try {
        const { token } = req.body;

        if (!token) {
          res.status(400).json({
            success: false,
            error: 'Token is required',
          });
          return;
        }

        const newToken = await AuthService.refreshToken(token);
        if (!newToken) {
          res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
          });
          return;
        }

        res.json({
          success: true,
          token: newToken,
        });
      } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    })();
  });

  /**
   * 生成 WebSocket Token - Generate WebSocket token
   * GET /api/ws-token
   *
   * 注意：现在 WebSocket 直接复用主 token，此接口返回主 token 以保持向后兼容
   * Note: WebSocket now reuses the main token, this endpoint returns the main token for backward compatibility
   */
  // Rate limit WebSocket token endpoint
  // 为 WebSocket token 端点添加速率限制
  app.get('/api/ws-token', apiRateLimiter, authenticatedActionLimiter, async (req: Request, res: Response, next) => {
    try {
      const sessionToken = TokenUtils.extractFromRequest(req);

      if (!sessionToken) {
        return next(createAppError('Unauthorized: Invalid or missing session', 401, 'unauthorized'));
      }

      const decoded = await AuthService.verifyToken(sessionToken);
      if (!decoded) {
        return next(createAppError('Unauthorized: Invalid session token', 401, 'unauthorized'));
      }

      const user = await UserRepository.findById(decoded.userId);
      if (!user) {
        return next(createAppError('Unauthorized: User not found', 401, 'unauthorized'));
      }

      // 直接返回主 token，不再生成单独的 WebSocket token
      res.json({
        success: true,
        wsToken: sessionToken, // 复用主 token
        expiresIn: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE, // 使用主 token 的过期时间
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * 二维码登录验证 - QR code login verification
   * POST /api/auth/qr-login
   */
  app.post('/api/auth/qr-login', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { qrToken } = req.body;

      if (!qrToken) {
        res.status(400).json({
          success: false,
          error: 'QR token is required',
        });
        return;
      }

      // 获取客户端 IP（用于本地网络限制验证）
      // Get client IP (for local network restriction verification)
      const clientIP = req.ip || req.socket.remoteAddress || '';

      // 直接验证 QR token（无需 IPC）/ Verify QR token directly (no IPC)
      const result = await verifyQRTokenDirect(qrToken, clientIP);

      if (!result.success || !result.data) {
        res.status(401).json({
          success: false,
          error: result.msg || 'Invalid or expired QR token',
        });
        return;
      }

      // 设置 session cookie（远程模式下启用 secure 标志）
      // Set session cookie (enable secure flag in remote mode)
      res.cookie(AUTH_CONFIG.COOKIE.NAME, result.data.sessionToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });
      const qrUser = await UserRepository.getSystemUser();
      if (qrUser) {
        registerBrowserWebuiLoginSession(req, qrUser, result.data.sessionToken, qrUser.role);
      }

      res.json({
        success: true,
        user: { username: result.data.username },
        token: result.data.sessionToken,
      });
    } catch (error) {
      console.error('QR login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * 二维码登录页面 - QR code login page
   * GET /qr-login
   * 安全处理：返回静态 HTML，JavaScript 从 URL 读取 token，避免 XSS
   * Security: Return static HTML, JavaScript reads token from URL to prevent XSS
   */
  app.get('/qr-login', (_req: Request, res: Response) => {
    res.send(QR_LOGIN_PAGE_HTML);
  });
}

export default registerAuthRoutes;
