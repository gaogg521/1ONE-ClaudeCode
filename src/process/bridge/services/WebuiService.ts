/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveLanIp } from '@/common/utils/resolveLanIp';
import { createHash, randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '@process/webserver/config/constants';
import { resolveEnterpriseContext } from '@process/webserver/auth/enterpriseContext';
import type { EnterpriseContextSnapshot } from '@/common/config/webuiEnterpriseConfig';
import {
  getLatestBrowserWebuiSession,
  type BrowserSessionSnapshot,
} from '@process/webserver/auth/browserSessionBridge';
import { session } from 'electron';

/**
 * WebUI 服务层 - 封装所有 WebUI 相关的业务逻辑
 * WebUI Service Layer - Encapsulates all WebUI-related business logic
 */
export class WebuiService {
  private static webServerFunctionsLoaded = false;
  private static _getInitialAdminPassword: (() => string | null) | null = null;
  private static _clearInitialAdminPassword: (() => void) | null = null;
  private static readonly RESET_EMAIL_TTL_MS = 5 * 60 * 1000;
  private static readonly RESET_EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
  private static readonly RESET_EMAIL_MAX_ATTEMPTS = 5;
  private static resetEmailChallenge:
    | {
        codeHash: string;
        expiresAt: number;
        attempts: number;
        email: string;
        sentAt: number;
      }
    | null = null;

  /**
   * 加载 webserver 函数（避免循环依赖）
   * Load webserver functions (avoid circular dependency)
   */
  private static async loadWebServerFunctions(): Promise<void> {
    if (this.webServerFunctionsLoaded) return;

    const webServer = await import('@process/webserver/index');
    this._getInitialAdminPassword = webServer.getInitialAdminPassword;
    this._clearInitialAdminPassword = webServer.clearInitialAdminPassword;
    this.webServerFunctionsLoaded = true;
  }

  /**
   * 获取初始管理员密码
   * Get initial admin password
   */
  private static getInitialAdminPassword(): string | null {
    return this._getInitialAdminPassword?.() ?? null;
  }

  /**
   * 清除初始管理员密码
   * Clear initial admin password
   */
  private static clearInitialAdminPassword(): void {
    this._clearInitialAdminPassword?.();
  }

  /**
   * 获取局域网 IP 地址
   * Get LAN IP address
   */
  static getLanIP(): string | null {
    return resolveLanIp();
  }

  /**
   * 统一的异步错误处理包装器
   * Unified async error handling wrapper
   */
  static async handleAsync<T>(
    handler: () => Promise<{ success: boolean; data?: T; msg?: string }>,
    context = 'Operation'
  ): Promise<{ success: boolean; data?: T; msg?: string }> {
    try {
      return await handler();
    } catch (error) {
      console.error(`[WebUI Service] ${context} error:`, error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : `${context} failed`,
      };
    }
  }

  /**
   * 获取管理员用户（带自动加载）
   * Get admin user (with auto-loading)
   */
  static async getAdminUser() {
    await this.loadWebServerFunctions();
    const adminUser = await UserRepository.getSystemUser();
    if (!adminUser) {
      throw new Error('WebUI user not found');
    }
    return adminUser;
  }

  /** Prefer the latest browser WebUI login; fall back to the built-in system user. */
  static async resolveWorkspaceProfileUserId(): Promise<string> {
    const synced = await this.syncBrowserWebuiSession();
    if (synced?.userId) {
      return synced.userId;
    }
    const adminUser = await this.getAdminUser();
    return adminUser.id;
  }

  private static maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    if (name.length <= 2) return `${name[0] ?? '*'}*@${domain}`;
    return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name[name.length - 1]}@${domain}`;
  }

  private static hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private static async getSmtpConfig() {
    const { resolveSmtpConfig } = await import('@process/webserver/auth/smtpConfig');
    return resolveSmtpConfig();
  }

  static async requestResetPasswordEmailCode(): Promise<{ maskedEmail: string }> {
    const adminUser = await this.getAdminUser();
    const email = String(adminUser.email ?? '').trim();
    if (!email) {
      throw new Error('ADMIN_EMAIL_NOT_CONFIGURED');
    }

    const smtp = await this.getSmtpConfig();
    if (!smtp) {
      throw new Error('SMTP_NOT_CONFIGURED');
    }

    const now = Date.now();
    if (this.resetEmailChallenge && now - this.resetEmailChallenge.sentAt < this.RESET_EMAIL_RESEND_COOLDOWN_MS) {
      throw new Error('RESET_CODE_RATE_LIMITED');
    }

    const code = `${randomInt(0, 1_000_000)}`.padStart(6, '0');
    this.resetEmailChallenge = {
      codeHash: this.hashCode(code),
      expiresAt: now + this.RESET_EMAIL_TTL_MS,
      attempts: 0,
      email,
      sentAt: now,
    };

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    await transporter.sendMail({
      from: smtp.from,
      to: email,
      subject: '1ONE 管理员密码重置验证码',
      text: `您的验证码是 ${code}，5 分钟内有效。若非本人操作请忽略。`,
    });

    return { maskedEmail: this.maskEmail(email) };
  }

  private static verifyResetPasswordEmailCode(code: string): void {
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      throw new Error('INVALID_RESET_CODE');
    }
    const challenge = this.resetEmailChallenge;
    if (!challenge) {
      throw new Error('RESET_CODE_NOT_REQUESTED');
    }
    if (Date.now() > challenge.expiresAt) {
      this.resetEmailChallenge = null;
      throw new Error('RESET_CODE_EXPIRED');
    }
    if (challenge.attempts >= this.RESET_EMAIL_MAX_ATTEMPTS) {
      this.resetEmailChallenge = null;
      throw new Error('RESET_CODE_ATTEMPTS_EXCEEDED');
    }
    if (this.hashCode(normalizedCode) !== challenge.codeHash) {
      challenge.attempts += 1;
      this.resetEmailChallenge = challenge;
      throw new Error('INVALID_RESET_CODE');
    }
    this.resetEmailChallenge = null;
  }

  /**
   * 获取 WebUI 状态
   * Get WebUI status
   */
  static async getStatus(
    webServerInstance: {
      server: import('http').Server;
      wss: import('ws').WebSocketServer;
      port: number;
      allowRemote: boolean;
    } | null
  ): Promise<IWebUIStatus> {
    await this.loadWebServerFunctions();

    const adminUser = await UserRepository.getSystemUser();
    const running = webServerInstance !== null;
    const port = webServerInstance?.port ?? SERVER_CONFIG.DEFAULT_PORT;
    const allowRemote = webServerInstance?.allowRemote ?? false;

    const localUrl = `http://localhost:${port}`;
    const lanIP = this.getLanIP();
    const networkUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : undefined;

    const { getAdminWebListenPort } = await import('@process/webserver/index');
    const adminPort = running ? getAdminWebListenPort() : null;
    const adminLocalUrl = adminPort ? `http://localhost:${adminPort}` : undefined;
    const adminNetworkUrl =
      adminPort && allowRemote && lanIP ? `http://${lanIP}:${adminPort}` : undefined;

    return {
      running,
      port,
      allowRemote,
      localUrl,
      networkUrl,
      adminPort: adminPort ?? undefined,
      adminLocalUrl,
      adminNetworkUrl,
      lanIP: lanIP ?? undefined,
      adminUsername: adminUser?.username ?? AUTH_CONFIG.DEFAULT_USER.USERNAME,
      adminEmail: adminUser?.email ?? undefined,
      initialPassword: this.getInitialAdminPassword() ?? undefined,
    };
  }

  /**
   * Set admin email (used for secure admin password reset via email code).
   * Admin email is stored on the system user record in `users.email`.
   */
  static async setAdminEmail(newEmail: string): Promise<void> {
    const email = newEmail.trim().toLowerCase();
    // Basic email validation. Database has UNIQUE constraint on `email`.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('INVALID_EMAIL');
    }

    const adminUser = await this.getAdminUser();
    await UserRepository.updateEmail(adminUser.id, email);

    // Clear any pending reset challenges after changing target email.
    this.resetEmailChallenge = null;
  }

  /**
   * 修改密码（不需要当前密码验证）
   * Change password (no current password verification required)
   */
  static async changePassword(newPassword: string): Promise<void> {
    const adminUser = await this.getAdminUser();

    // 验证新密码强度 / Validate new password strength
    const passwordValidation = AuthService.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.errors.join('; '));
    }

    // 更新密码（密文存储）/ Update password (encrypted storage)
    const newPasswordHash = await AuthService.hashPassword(newPassword);
    await UserRepository.updatePassword(adminUser.id, newPasswordHash);

    // 使所有现有 token 失效 / Invalidate all existing tokens
    await AuthService.invalidateAllTokens();

    // 清除初始密码（用户已修改密码）/ Clear initial password (user has changed password)
    this.clearInitialAdminPassword();
  }

  static async changeUsername(newUsername: string): Promise<string> {
    const adminUser = await this.getAdminUser();
    const normalizedUsername = newUsername.trim();

    const usernameValidation = AuthService.validateUsername(normalizedUsername);
    if (!usernameValidation.isValid) {
      throw new Error(usernameValidation.errors.join('; '));
    }

    const existingUser = await UserRepository.findByUsername(normalizedUsername);
    if (existingUser && existingUser.id !== adminUser.id) {
      throw new Error('Username already exists');
    }

    if (normalizedUsername === adminUser.username) {
      return adminUser.username;
    }

    await UserRepository.updateUsername(adminUser.id, normalizedUsername);
    await AuthService.invalidateAllTokens();

    return normalizedUsername;
  }

  /**
   * 重置密码（生成新的随机密码）
   * Reset password (generate new random password)
   */
  static async resetPasswordWithEmailCode(code: string): Promise<string> {
    this.verifyResetPasswordEmailCode(code);
    const adminUser = await this.getAdminUser();

    // 生成新的随机密码 / Generate new random password
    const newPassword = AuthService.generateRandomPassword();
    const newPasswordHash = await AuthService.hashPassword(newPassword);

    // 更新密码 / Update password
    await UserRepository.updatePassword(adminUser.id, newPasswordHash);

    // 使所有现有 token 失效 / Invalidate all existing tokens
    await AuthService.invalidateAllTokens();

    // 清除旧的初始密码 / Clear old initial password
    this.clearInitialAdminPassword();

    return newPassword;
  }

  /**
   * Reset an arbitrary user's password with admin email verification code.
   * Verification code is sent to `users.email` of the system admin user.
   */
  static async resetUserPasswordWithEmailCode(
    userId: string,
    newPassword: string,
    code: string
  ): Promise<void> {
    this.verifyResetPasswordEmailCode(code);

    const passwordValidation = AuthService.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.errors.join('; '));
    }

    const newPasswordHash = await AuthService.hashPassword(newPassword);
    await UserRepository.updatePassword(userId, newPasswordHash);

    // If target is the system admin, clear the cached initial password.
    const adminUser = await this.getAdminUser();
    if (adminUser.id === userId) {
      this.clearInitialAdminPassword();
    }

    // Rotate JWT secret to invalidate all existing tokens after a privileged password reset.
    await AuthService.invalidateAllTokens();
  }

  /**
   * Enterprise membership for the local WebUI instance (desktop IPC / pre-login).
   * Uses the built-in system user row as the source of truth.
   */
  static async getEnterpriseContext(): Promise<EnterpriseContextSnapshot> {
    const adminUser = await this.getAdminUser();
    const ctx = await resolveEnterpriseContext(adminUser.tenant_id);
    const { getInstanceGovernance } = await import('@process/webserver/auth/instanceGovernance');
    const governance = await getInstanceGovernance(adminUser.role);
    return {
      ...ctx,
      role: adminUser.role,
      canCreateEnterprise: !ctx.joined && adminUser.role === 'system_admin',
      hasSystemAdmin: governance.hasSystemAdmin,
      canClaimSystemAdmin: governance.canClaimSystemAdmin,
    };
  }

  static async getDesktopSessionToken(): Promise<{ token: string }> {
    const synced = await WebuiService.syncBrowserWebuiSession();
    if (synced?.token) {
      return { token: synced.token };
    }
    throw new Error('No browser WebUI session available for desktop sync');
  }

  /**
   * Pick up the latest browser WebUI login for this instance (IPC-only; not exposed over HTTP).
   */
  static async syncBrowserWebuiSession(): Promise<BrowserSessionSnapshot | null> {
    const bridged = getLatestBrowserWebuiSession();
    if (bridged) {
      const verified = await AuthService.verifyToken(bridged.token);
      if (verified) {
        return bridged;
      }
    }

    const { getWebServerInstance } = await import('@process/bridge/webuiBridge');
    const instance = getWebServerInstance();
    if (!instance?.port) {
      return null;
    }

    const lanIP = this.getLanIP();
    const networkUrl = instance.allowRemote && lanIP ? `http://${lanIP}:${instance.port}` : undefined;
    const { buildWebuiSessionCookieUrls } = await import('@/common/config/webuiApiBaseCandidates');
    const cookieUrls = buildWebuiSessionCookieUrls({
      port: instance.port,
      localUrl: `http://localhost:${instance.port}`,
      networkUrl,
      lanIP: lanIP ?? undefined,
    });

    for (const url of cookieUrls) {
      try {
        const cookies = await session.defaultSession.cookies.get({
          url,
          name: AUTH_CONFIG.COOKIE.NAME,
        });
        const cookieToken = cookies[0]?.value;
        if (!cookieToken) {
          continue;
        }
        const decoded = await AuthService.verifyToken(cookieToken);
        if (!decoded) {
          continue;
        }
        const user = await UserRepository.findById(decoded.userId);
        if (!user) {
          continue;
        }
        return {
          userId: user.id,
          username: user.username,
          role: user.role ?? 'member',
          token: cookieToken,
          updatedAt: Date.now(),
        };
      } catch {
        // try next host (127.0.0.1 vs LAN IP cookie jars)
      }
    }
    return null;
  }

  static async previewEnterpriseInvite(code: string) {
    const { previewEnterpriseInvite } = await import('@process/webserver/auth/enterpriseJoinService');
    return previewEnterpriseInvite(code);
  }

  static async joinEnterpriseAsLocalAdmin(code: string) {
    const { joinEnterpriseWithInvite } = await import('@process/webserver/auth/enterpriseJoinService');
    const adminUser = await this.getAdminUser();
    return joinEnterpriseWithInvite(adminUser.id, code);
  }

  static async createEnterpriseAsLocalAdmin(name: string) {
    const { createEnterpriseTenant } = await import('@process/webserver/auth/enterpriseJoinService');
    const adminUser = await this.getAdminUser();
    return createEnterpriseTenant(adminUser.id, name);
  }
}
