/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { AuthMiddleware } from '@process/webserver/auth/middleware/AuthMiddleware';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AuthProviderRepository } from '@process/webserver/auth/repository/AuthProviderRepository';
import { AuthIdentityRepository } from '@process/webserver/auth/repository/AuthIdentityRepository';
import type { AuthProviderType } from '@process/services/database/types';
import { AUTH_CONFIG, getCookieOptions } from '../config/constants';
import { TokenUtils } from '@process/webserver/auth/middleware/TokenMiddleware';
import { createAppError } from '../middleware/errorHandler';
import { authRateLimiter, authenticatedActionLimiter, apiRateLimiter } from '../middleware/security';
import { verifyQRTokenDirect } from '@process/bridge/webuiQR';
import { authenticateWithLdap, type LdapProviderConfig } from '../auth/providers/LdapAuthProvider';
import {
  listEnterpriseSecondaryOptions,
  parseEnterpriseElevationPasswordMethod,
  verifyEnterpriseElevationPassword,
} from '../auth/enterpriseElevationSecondary';
import { isEnterpriseElevatableRole } from '../auth/enterpriseRoles';
import {
  buildFeishuAuthorizeUrl,
  exchangeFeishuCodeForUserAccessToken,
  fetchFeishuUserInfo,
  resolveFeishuExternalId,
  type FeishuProviderConfig,
} from '../auth/providers/FeishuAuthProvider';

const FEISHU_QR_SDK_URL =
  'https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.3.js';

const feishuStateStore: Map<string, number> = new Map();
const FEISHU_STATE_TTL_MS = 10 * 60 * 1000;

function issueFeishuState(): string {
  const state = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  feishuStateStore.set(state, Date.now() + FEISHU_STATE_TTL_MS);
  return state;
}

function consumeFeishuState(state: string): boolean {
  const expiry = feishuStateStore.get(state);
  feishuStateStore.delete(state);
  if (!expiry) return false;
  return Date.now() <= expiry;
}

function cleanupFeishuState(): void {
  const now = Date.now();
  for (const [k, exp] of feishuStateStore.entries()) {
    if (now > exp) feishuStateStore.delete(k);
  }
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
   * 飞书授权入口
   * - mode=oauth: 直接 302 跳转到授权页
   * - mode=qr: 返回 goto URL，前端配合 QR SDK 生成二维码
   */
  app.get('/api/auth/feishu/authorize', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      cleanupFeishuState();
      const mode = String(req.query.mode ?? 'oauth');

      const providerRow = await AuthProviderRepository.getProvider('feishu');
      const cfg = (providerRow?.config ?? {}) as unknown as FeishuProviderConfig;
      const appId = cfg.appId || process.env.FEISHU_APP_ID || '';
      const redirectUri = cfg.redirectUri || process.env.FEISHU_REDIRECT_URI || '';
      if (!providerRow?.enabled) {
        res.status(404).json({ success: false, message: 'Feishu login is not enabled' });
        return;
      }
      if (!appId || !redirectUri) {
        res.status(500).json({ success: false, message: 'Feishu provider not configured' });
        return;
      }

      const state = issueFeishuState();
      const goto = buildFeishuAuthorizeUrl({ appId, redirectUri, state });

      if (mode === 'qr') {
        res.json({ success: true, data: { sdkUrl: FEISHU_QR_SDK_URL, goto, state } });
        return;
      }

      res.redirect(goto);
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
      if (!consumeFeishuState(state)) {
        res.status(400).send('Invalid state');
        return;
      }

      const providerRow = await AuthProviderRepository.getProvider('feishu');
      const cfg = (providerRow?.config ?? {}) as unknown as FeishuProviderConfig;
      const appId = cfg.appId || process.env.FEISHU_APP_ID || '';
      const appSecret = cfg.appSecret || process.env.FEISHU_APP_SECRET || '';
      if (!providerRow?.enabled) {
        res.status(404).send('Feishu login is not enabled');
        return;
      }
      if (!appId || !appSecret) {
        res.status(500).send('Feishu provider not configured');
        return;
      }

      const token = await exchangeFeishuCodeForUserAccessToken({ appId, appSecret, code });
      const userInfo = await fetchFeishuUserInfo(token);
      const externalIdField = (cfg.externalIdField ?? 'union_id') as 'union_id' | 'open_id';
      const externalId = resolveFeishuExternalId(userInfo, externalIdField);
      if (!externalId) {
        res.status(500).send('Failed to resolve Feishu user identity');
        return;
      }

      const identity = await AuthIdentityRepository.getByExternalId('feishu', externalId);
      if (!identity) {
        res.status(403).send('Account not bound. Please contact admin.');
        return;
      }
      const user = await UserRepository.findById(identity.user_id);
      if (!user) {
        res.status(403).send('Bound user not found');
        return;
      }

      const sessionToken = await AuthService.generateToken({
        id: user.id,
        username: user.username,
        role: user.role ?? 'user',
      });

      await UserRepository.updateLastLogin(user.id);
      res.cookie(AUTH_CONFIG.COOKIE.NAME, sessionToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      // Unified landing: enter system homepage
      res.redirect('/');
    } catch (error) {
      console.error('[AuthRoute] feishu callback error:', error);
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
      const { username, password } = req.body;

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

      // Generate JWT token
      const token = await AuthService.generateToken(user);

      // Update last login
      await UserRepository.updateLastLogin(user.id);

      // Set secure cookie（远程模式下启用 secure 标志）
      // Set secure cookie (enable secure flag in remote mode)
      res.cookie(AUTH_CONFIG.COOKIE.NAME, token, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
        },
        token,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * LDAP 登录（域控账号）
   * POST /api/auth/ldap/login
   *
   * 说明：按“预创建绑定”策略，仅允许已绑定到本地 user 的外部账号登录
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

      // 绑定检查：externalId -> userId
      const identity = await AuthIdentityRepository.getByExternalId(provider, result.externalId);
      if (!identity) {
        res.status(403).json({ success: false, message: 'Account not bound. Please contact admin.' });
        return;
      }

      const user = await UserRepository.findById(identity.user_id);
      if (!user) {
        res.status(403).json({ success: false, message: 'Bound user not found' });
        return;
      }

      const token = await AuthService.generateToken({
        id: user.id,
        username: user.username,
        role: result.isAdmin ? 'admin' : (user.role ?? 'user'),
      });

      await UserRepository.updateLastLogin(user.id);
      res.cookie(AUTH_CONFIG.COOKIE.NAME, token, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: { id: user.id, username: user.username },
        token,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('invalidcredentials') || msg.toLowerCase().includes('invalid credentials')) {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
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
      }

      res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      res.clearCookie(AUTH_CONFIG.COOKIE.ENTERPRISE_NAME, { path: '/' });
      res.json({ success: true, message: 'Logged out successfully' });
    }
  );

  /**
   * Enterprise admin panel: elevation status (eligible = org/system admin; elevated = password re-auth OK)
   * GET /api/auth/enterprise-elevation
   */
  app.get(
    '/api/auth/enterprise-elevation',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    async (req: Request, res: Response) => {
      const role = req.user?.role;
      const eligible = isEnterpriseElevatableRole(role);
      if (!eligible) {
        res.clearCookie(AUTH_CONFIG.COOKIE.ENTERPRISE_NAME, { path: '/' });
        res.json({ success: true, data: { eligible: false, elevated: false, secondaryMethods: [] } });
        return;
      }
      let elevated = false;
      const raw = req.cookies?.[AUTH_CONFIG.COOKIE.ENTERPRISE_NAME];
      if (typeof raw === 'string' && raw.trim() !== '') {
        const v = await AuthService.verifyEnterpriseElevationToken(raw.trim());
        elevated = Boolean(v && v.userId === req.user?.id);
      }
      const secondaryMethods = await listEnterpriseSecondaryOptions(req.user!.id);
      res.json({ success: true, data: { eligible, elevated, secondaryMethods } });
    }
  );

  /**
   * Secondary verification for enterprise management — sets HttpOnly elevation cookie.
   * Password flow: body.password + optional body.method ('auto' | 'local_password' | 'ldap').
   * OAuth (Feishu/DingTalk/WeCom): reserved — use GET secondaryMethods + dedicated endpoints when implemented.
   * POST /api/auth/enterprise-elevate
   */
  app.post(
    '/api/auth/enterprise-elevate',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    async (req: Request, res: Response) => {
      try {
        const role = req.user?.role;
        if (!isEnterpriseElevatableRole(role)) {
          res.status(403).json({ success: false, message: 'Not eligible for enterprise management' });
          return;
        }
        const rawMethod = (req.body as { method?: unknown })?.method;
        if (typeof rawMethod === 'string' && ['feishu', 'dingtalk', 'wecom'].includes(rawMethod)) {
          res.status(501).json({
            success: false,
            code: 'ELEVATION_OAUTH_NOT_IMPLEMENTED',
            message: 'OAuth enterprise elevation for this provider is not implemented yet',
          });
          return;
        }

        const passwordMethod = parseEnterpriseElevationPasswordMethod(rawMethod);
        if (passwordMethod === null) {
          res.status(400).json({ success: false, message: 'Invalid method' });
          return;
        }

        const password = String(req.body?.password ?? '');
        if (!password) {
          res.status(400).json({ success: false, message: 'Password is required' });
          return;
        }
        const user = await UserRepository.findById(req.user!.id);
        if (!user) {
          res.status(404).json({ success: false, message: 'User not found' });
          return;
        }

        const verified = await verifyEnterpriseElevationPassword({
          user,
          password,
          method: passwordMethod,
        });

        if (!verified) {
          res.status(401).json({ success: false, message: 'Incorrect password' });
          return;
        }

        const token = await AuthService.signEnterpriseElevation(user.id);
        res.cookie(AUTH_CONFIG.COOKIE.ENTERPRISE_NAME, token, {
          ...getCookieOptions(),
          maxAge: AUTH_CONFIG.COOKIE.ENTERPRISE_MAX_AGE_MS,
        });
        res.json({ success: true });
      } catch (error) {
        console.error('[AuthRoute] enterprise-elevate error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  );

  /**
   * Clear enterprise elevation without full logout
   * POST /api/auth/enterprise-elevate/revoke
   */
  app.post(
    '/api/auth/enterprise-elevate/revoke',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    (_req: Request, res: Response) => {
      res.clearCookie(AUTH_CONFIG.COOKIE.ENTERPRISE_NAME, { path: '/' });
      res.json({ success: true });
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
        res.clearCookie(AUTH_CONFIG.COOKIE.ENTERPRISE_NAME, { path: '/' });

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
