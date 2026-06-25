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
import fs from 'fs';
import path from 'path';
import { resolveAllLanIps } from '@/common/utils/resolveLanIp';
import { AuthMiddleware } from '@process/webserver/auth/middleware/AuthMiddleware';
import { errorHandler, createAppError } from './middleware/errorHandler';
import { attachCsrfToken } from './middleware/security';
import { getDataPath } from '@process/utils/utils';

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
 * 优先级：环境变量 > 持久化文件 > 随机生成（每次启动不同）
 * Priority: Environment variable > Persistent file > Random generation
 */
function getCsrfSecret(): string {
  // 优先使用环境变量 / Prefer environment variable
  if (process.env.CSRF_SECRET && process.env.CSRF_SECRET.length === 32) {
    return process.env.CSRF_SECRET;
  }

  // 持久化到文件，避免重启后所有已登录用户 cookie 失效
  // Persist to file so logged-in cookies survive restarts
  try {
    const secretPath = path.join(getDataPath(), 'csrf-secret.txt');
    const persisted = fs.existsSync(secretPath) ? fs.readFileSync(secretPath, 'utf8').trim() : '';
    if (persisted.length === 32) {
      return persisted;
    }
    const fresh = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, fresh, { mode: 0o600 });
    return fresh;
  } catch {
    // Fallback to in-memory only if the data dir is unavailable
    console.warn('[security] Failed to persist CSRF secret; using ephemeral in-memory secret');
    return crypto.randomBytes(16).toString('hex');
  }
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
export function shouldBypassCsrfByPath(pathOnly: string): boolean {
  if (pathOnly === '/login' || pathOnly === '/api/auth/ldap/login') {
    return true;
  }
  if (pathOnly === '/api/auth/qr-login') {
    return true;
  }
  if (pathOnly === '/api/upload' || pathOnly.startsWith('/api/upload/')) {
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
  // Path-based bypass (see `shouldBypassCsrfByPath`): fixes querystring mismatches vs tiny-csrf string excludes.
  // 企业管理写操作不再整体豁免；前端 JSON/FormData 请求会附带 CSRF token。
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
    // tiny-csrf only reads _csrf from req.body; copy header token to body as fallback
    // so that clients using x-csrf-token header (after ensureCsrfTokenForMutation) also pass validation.
    if (
      req.body &&
      typeof req.body === 'object' &&
      !req.body._csrf &&
      typeof req.headers['x-csrf-token'] === 'string'
    ) {
      req.body._csrf = req.headers['x-csrf-token'];
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
  } catch {
    return null;
  }
}

function getConfiguredOrigins(port: number, allowRemote: boolean, additionalPorts: number[] = []): Set<string> {
  const ports = [port, ...additionalPorts.filter((p) => p > 0 && p !== port)];
  const baseOrigins = new Set<string>();
  for (const listenPort of ports) {
    baseOrigins.add(`http://localhost:${listenPort}`);
    baseOrigins.add(`http://127.0.0.1:${listenPort}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    const normalizedRendererOrigin = rendererUrl ? normalizeOrigin(rendererUrl) : null;
    if (normalizedRendererOrigin) {
      baseOrigins.add(normalizedRendererOrigin);
    }
    // Vite may fall back to 5174+ when 5173 is taken; allow the whole dev port range.
    for (let vitePort = 5173; vitePort <= 5190; vitePort += 1) {
      baseOrigins.add(`http://localhost:${vitePort}`);
      baseOrigins.add(`http://127.0.0.1:${vitePort}`);
    }
  }

  // 允许远程访问时，自动添加所有网络接口 IP（LAN、VPN、Tailscale 等）
  // When remote access is enabled, add all network interface IPs (LAN, VPN, Tailscale, etc.)
  if (allowRemote) {
    const allIPs = getAllNonInternalIPs();
    for (const ip of allIPs) {
      for (const listenPort of ports) {
        baseOrigins.add(`http://${ip}:${listenPort}`);
        console.log(`[CORS] Added IP to allowed origins: http://${ip}:${listenPort}`);
      }
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

export function setupCors(
  app: Express,
  port: number,
  allowRemote: boolean,
  additionalPorts: number[] = []
): void {
  const allowedOrigins = getConfiguredOrigins(port, allowRemote, additionalPorts);

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
