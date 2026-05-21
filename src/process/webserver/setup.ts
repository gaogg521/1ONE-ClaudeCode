/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csrf from 'tiny-csrf';
import crypto from 'crypto';
import { resolveAllLanIps } from '@/common/utils/resolveLanIp';
import { AuthMiddleware } from '@process/webserver/auth/middleware/AuthMiddleware';
import { errorHandler, createAppError } from './middleware/errorHandler';
import { attachCsrfToken } from './middleware/security';

/**
 * 获取物理网卡 IPv4 地址（排除 VMware 等虚拟网卡；含 Tailscale 等）
 * Get physical NIC IPv4 addresses (skip virtual adapters; includes Tailscale, etc.)
 */
function getAllNonInternalIPs(): string[] {
  return resolveAllLanIps();
}

/**
 * 获取或生成 CSRF Secret
 * Get or generate CSRF secret
 *
 * CSRF secret must be exactly 32 characters for AES-256-CBC
 * CSRF 密钥必须正好 32 个字符以用于 AES-256-CBC
 *
 * 优先级：环境变量 > 随机生成（每次启动不同）
 * Priority: Environment variable > Random generation (different on each startup)
 */
function getCsrfSecret(): string {
  // 优先使用环境变量 / Prefer environment variable
  if (process.env.CSRF_SECRET && process.env.CSRF_SECRET.length === 32) {
    return process.env.CSRF_SECRET;
  }

  // 生成随机 32 字符密钥（16 字节的 hex 编码）
  // Generate random 32-character secret (16 bytes hex encoded)
  const randomSecret = crypto.randomBytes(16).toString('hex');
  console.log('[security] Generated random CSRF secret for this session');
  return randomSecret;
}

// 在模块加载时生成一次，整个进程生命周期内保持不变
// Generate once at module load, remains constant for process lifetime
const CSRF_SECRET = getCsrfSecret();

/** tiny-csrf cookie options (mirror `tiny-csrf/index.js`). */
const CSRF_COOKIE_PARAMS = Object.freeze({
  httpOnly: true,
  sameSite: 'strict' as const,
  signed: true,
  maxAge: 300000,
});

// Loaded via runtime `require`; main bundle is CJS-compatible and `tiny-csrf` is externalized from the bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const encryptCookieForCsrf = require('tiny-csrf/encryption').encryptCookie as (
  cookie: string,
  secret: string
) => string;

/**
 * Normalize path for CSRF exemptions: tiny-csrf matches `originalUrl`, so querystrings break string excludes like `/login`.
 * Path-only whitelist keeps admin JSON and auth endpoints aligned with intent.
 */
function normalizeRequestPathForCsrf(req: Request): string {
  const raw = typeof req.originalUrl === 'string' ? req.originalUrl : req.url;
  if (!raw || raw === '') {
    return '/';
  }
  const pathOnly = raw.split('?')[0]?.split('#')[0];
  return pathOnly === '' ? '/' : pathOnly;
}

/**
 * Same exclusions as legacy `csrf(..., excludedUrls)` but keyed on pathname only (ignores query / hash).
 */
function shouldBypassCsrfByPath(pathOnly: string): boolean {
  if (pathOnly === '/login') {
    return true;
  }
  if (pathOnly === '/api/auth/qr-login') {
    return true;
  }
  if (pathOnly === '/api/upload' || pathOnly.startsWith('/api/upload/')) {
    return true;
  }
  if (pathOnly === '/api/auth/enterprise-elevate' || pathOnly.startsWith('/api/auth/enterprise-elevate/')) {
    return true;
  }
  if (pathOnly === '/api/admin' || pathOnly.startsWith('/api/admin/')) {
    return true;
  }
  return false;
}

/**
 * Replicate tiny-csrf "excluded URL" branch so `attachCsrfToken` can expose `x-csrf-token` without running body verification.
 */
function attachCsrfTokenBypass(req: Request, res: Response, secret: string): void {
  req.csrfToken = () => {
    const csrfPlaintext = crypto.randomUUID();
    res.cookie('csrfToken', encryptCookieForCsrf(csrfPlaintext, secret), CSRF_COOKIE_PARAMS);
    return csrfPlaintext;
  };
}

/**
 * 配置基础中间件
 * Configure basic middleware for Express app
 */
export function setupBasicMiddleware(app: Express): void {
  // 请求体解析器
  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CSRF Protection using tiny-csrf (CodeQL compliant)
  // Must be applied after cookieParser and before routes
  // CSRF 保护使用 tiny-csrf（符合 CodeQL 要求）
  // 必须在 cookieParser 之后、路由之前应用
  app.use(cookieParser('cookie-parser-secret'));
  // P1 安全修复：登录接口启用 CSRF 保护（前端已添加 withCsrfToken）
  // P1 Security fix: Enable CSRF for login (frontend already uses withCsrfToken)
  // Path-based bypass (see `shouldBypassCsrfByPath`): fixes querystring mismatches vs tiny-csrf string excludes
  // and keeps /api/admin/* off body verification while still emitting CSRF helpers for SPA.
  // 企业管理 / 登录豁免：按 pathname 判断，避免因 ?xxx 无法命中 tiny-csrf 的字符串排除而误拦。
  const csrfMw = csrf(CSRF_SECRET, ['POST', 'PUT', 'DELETE', 'PATCH'], [], []);

  /**
   * tiny-csrf 在校验失败时同步 throw，否则会落到全局 ErrorHandler → 误判为 HTTP 500。
   * Normalize to HTTP 403 so clients / i18n can show CSRF refresh guidance.
   */
  app.use((req: Request, res: Response, next: NextFunction) => {
    const pathOnly = normalizeRequestPathForCsrf(req);
    if (shouldBypassCsrfByPath(pathOnly)) {
      attachCsrfTokenBypass(req, res, CSRF_SECRET);
      next();
      return;
    }
    try {
      csrfMw(req, res, next);
    } catch {
      next(createAppError('CSRF verification failed.', 403, 'csrf_invalid'));
    }
  });
  app.use(attachCsrfToken); // Attach token to response headers

  // 安全中间件
  // Security middleware
  app.use(AuthMiddleware.securityHeadersMiddleware);
  app.use(AuthMiddleware.requestLoggingMiddleware);
}

/**
 * 配置 CORS（跨域资源共享）
 * Configure CORS based on server mode
 */
function normalizeOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const portSuffix = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${portSuffix}`;
  } catch (error) {
    return null;
  }
}

function getConfiguredOrigins(port: number, allowRemote: boolean): Set<string> {
  const baseOrigins = new Set<string>([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

  // 允许远程访问时，自动添加所有网络接口 IP（LAN、VPN、Tailscale 等）
  // When remote access is enabled, add all network interface IPs (LAN, VPN, Tailscale, etc.)
  if (allowRemote) {
    const allIPs = getAllNonInternalIPs();
    for (const ip of allIPs) {
      baseOrigins.add(`http://${ip}:${port}`);
      console.log(`[CORS] Added IP to allowed origins: http://${ip}:${port}`);
    }
  }

  if (process.env.SERVER_BASE_URL) {
    const normalizedBase = normalizeOrigin(process.env.SERVER_BASE_URL);
    if (normalizedBase) {
      baseOrigins.add(normalizedBase);
    }
  }

  const extraOrigins = (process.env.ONE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  extraOrigins.forEach((origin) => baseOrigins.add(origin));

  return baseOrigins;
}

export function setupCors(app: Express, port: number, allowRemote: boolean): void {
  const allowedOrigins = getConfiguredOrigins(port, allowRemote);

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) {
          // Requests like curl or same-origin don't send an Origin header
          callback(null, true);
          return;
        }

        if (origin === 'null') {
          callback(null, true);
          return;
        }

        const normalizedOrigin = normalizeOrigin(origin);
        if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    })
  );
}

/**
 * 配置错误处理中间件（必须最后注册）
 * Configure error handling middleware (must be registered last)
 */
export function setupErrorHandler(app: Express): void {
  app.use(errorHandler);
}
