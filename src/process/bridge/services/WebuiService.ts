/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { networkInterfaces } from 'os';
import { createHash, randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import type { IWebUIStatus } from '@/common/adapter/ipcBridge';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG, SERVER_CONFIG } from '@process/webserver/config/constants';

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
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      const netInfo = nets[name];
      if (!netInfo) continue;

      for (const net of netInfo) {
        // Node.js 18.4+ returns number (4/6), older versions return string ('IPv4'/'IPv6')
        const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
        const isNotInternal = !net.internal;
        if (isIPv4 && isNotInternal) {
          return net.address;
        }
      }
    }
    return null;
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

  private static maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    if (name.length <= 2) return `${name[0] ?? '*'}*@${domain}`;
    return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name[name.length - 1]}@${domain}`;
  }

  private static hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private static getSmtpConfig():
    | {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
        from: string;
      }
    | null {
    const host = String(process.env.ONE_SMTP_HOST ?? '').trim();
    const portRaw = String(process.env.ONE_SMTP_PORT ?? '').trim();
    const user = String(process.env.ONE_SMTP_USER ?? '').trim();
    const pass = String(process.env.ONE_SMTP_PASS ?? '').trim();
    const from = String(process.env.ONE_SMTP_FROM ?? '').trim();
    if (!host || !portRaw || !user || !pass || !from) return null;
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port <= 0) return null;
    const secure = String(process.env.ONE_SMTP_SECURE ?? '').trim().toLowerCase() === 'true' || port === 465;
    return { host, port, secure, user, pass, from };
  }

  static async requestResetPasswordEmailCode(): Promise<{ maskedEmail: string }> {
    const adminUser = await this.getAdminUser();
    const email = String(adminUser.email ?? '').trim();
    if (!email) {
      throw new Error('ADMIN_EMAIL_NOT_CONFIGURED');
    }

    const smtp = this.getSmtpConfig();
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

    return {
      running,
      port,
      allowRemote,
      localUrl,
      networkUrl,
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
}
