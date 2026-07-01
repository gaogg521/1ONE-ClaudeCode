/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { getPlatformServices } from '@/common/platform';
import { TokenMiddleware } from '@process/webserver/auth/middleware/TokenMiddleware';
import { AUTH_CONFIG } from '../config/constants';
import { createRateLimiter } from '../middleware/security';
import { resolveDevViteHost } from '@/common/config/devRendererUrl';

/**
 * Vite dev server port — read from ELECTRON_RENDERER_URL when available
 * (electron-vite sets it to the actual port), fallback to 5173.
 */
const VITE_DEV_PORT = (() => {
  const url = process.env['ELECTRON_RENDERER_URL'];
  if (url) {
    try {
      return Number(new URL(url).port) || 5173;
    } catch {
      // ignore parse errors
    }
  }
  return 5173;
})();

const VITE_DEV_HOST = resolveDevViteHost(process.env['ELECTRON_RENDERER_URL']);

/**
 * Try to resolve built renderer assets path, return null if not found
 */
const resolveRendererPath = (): {
  staticRoot: string;
  indexHtml: string;
} | null => {
  const appPath = getPlatformServices().paths.getAppPath();
  if (!appPath) return null;

  const candidates = [
    {
      staticRoot: path.join(appPath, 'out', 'renderer'),
      indexHtml: path.join(appPath, 'out', 'renderer', 'index.html'),
    },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.indexHtml)) {
      return candidate;
    }
  }

  return null;
};

/** Hostnames that should use the Vite dev proxy (HMR-safe on the same machine). */
export function isLocalWebUiHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    const hostname = end >= 0 ? trimmed.slice(1, end) : trimmed;
    return hostname === '::1' || hostname === 'localhost';
  }
  const hostname = trimmed.split(':')[0] ?? '';
  if (!hostname) return true;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Create a proxy middleware that forwards requests to the Vite dev server
 */
function createViteDevProxy(): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    // Remove ALL restrictive security headers set by Express middleware -
    // Vite dev server content doesn't need them and they block HMR/inline scripts
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('X-Content-Type-Options');
    res.removeHeader('X-XSS-Protection');

    const options: http.RequestOptions = {
      hostname: VITE_DEV_HOST,
      port: VITE_DEV_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${VITE_DEV_HOST}:${VITE_DEV_PORT}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const headers = proxyRes.headers;
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) {
          try {
            res.setHeader(key, value);
          } catch {
            // Ignore invalid header errors
          }
        }
      }
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      // console.error here triggers @office-ai/platform's console patch →
      // bridge.adapter.emit → win.webContents.send. When the Vite dev server is
      // unreachable and the browser loads dozens of static assets, every failed
      // proxy request fires this callback and freezes the main process.
      // Write to file instead (best-effort, never throw from middleware).
      try {
        const { appendFileSync, mkdirSync } = require('node:fs');
        const { join } = require('node:path');
        const { getPlatformServices } = require('@/common/platform');
        const logsDir = getPlatformServices().paths.getLogsDir();
        try { mkdirSync(logsDir, { recursive: true }); } catch {}
        appendFileSync(join(logsDir, 'webui-vite-proxy.log'),
          `[${new Date().toISOString()}] ${req.method} ${req.url} - ${err.message}\n`, 'utf-8');
      } catch {
        // best-effort
      }
      if (!res.headersSent) {
        res.status(502).send(`[WebUI] Vite dev server (${VITE_DEV_HOST}:${VITE_DEV_PORT}) unavailable: ${err.message}`);
      }
    });

    req.pipe(proxyReq);
  };
}

/**
 * Register static asset routes for production mode
 */
function registerProductionStaticRoutes(expressApp: Express, staticRoot: string, indexHtmlPath: string): void {
  const pageRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    message: 'Too many requests, please try again later',
  });

  const serveApplication = async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      if (typeof req.query['__one_cache_bust'] === 'string') {
        res.setHeader('Clear-Site-Data', '"cache"');
      }

      const token = TokenMiddleware.extractToken(req);
      if (token && !(await TokenMiddleware.isTokenValid(token))) {
        res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      }

      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error serving index.html:', error);
      const missingIndex = error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (missingIndex) {
        res
          .status(500)
          .send(
            'WebUI renderer is not built. Run "npm run build:webui" on the server, then reload this page (Ctrl+F5).'
          );
        return;
      }
      res.status(500).send('Internal Server Error');
    }
  };

  expressApp.get('/', pageRateLimiter, serveApplication);

  // SPA sub-routes (React Router)
  expressApp.get(/^\/(?!api|static|assets)(?!.*\.[a-zA-Z0-9]+$).*/, pageRateLimiter, serveApplication);

  const assetsDir = path.join(staticRoot, 'assets');
  if (fs.existsSync(assetsDir)) {
    expressApp.use(
      '/assets',
      express.static(assetsDir, {
        immutable: true,
        maxAge: '365d',
        fallthrough: false,
      })
    );
  }

  expressApp.use(
    express.static(staticRoot, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html') || filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith('/sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    })
  );

  const staticDir = path.join(staticRoot, 'static');
  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    expressApp.use('/static', express.static(staticDir));
  }
}

/** API/auth paths must never be proxied to Vite (would break login & QR). */
function shouldProxyToVite(req: import('express').Request): boolean {
  const pathOnly = req.path;
  if (pathOnly.startsWith('/api')) return false;
  if (pathOnly === '/login' || pathOnly === '/logout' || pathOnly === '/qr-login') return false;
  if (pathOnly.startsWith('/ws')) return false;
  // Non-GET requests to backend paths should not hit Vite
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return true;
}

function registerViteDevProxy(expressApp: Express, localOnly = false): void {
  const proxy = createViteDevProxy();
  expressApp.use((req, res, next) => {
    if (!shouldProxyToVite(req)) {
      next();
      return;
    }
    if (localOnly && !isLocalWebUiHost(req.headers.host)) {
      next();
      return;
    }
    proxy(req, res);
  });
}

function registerRemoteStaticFallback(expressApp: Express): void {
  expressApp.use((req, res, next) => {
    if (!shouldProxyToVite(req)) {
      next();
      return;
    }
    if (isLocalWebUiHost(req.headers.host)) {
      next();
      return;
    }
    res
      .status(503)
      .type('text/plain')
      .send(
        '[WebUI] LAN/remote access requires built renderer assets. Run: npx electron-vite build\n' +
          'Or start with: npm run webui:prod:remote'
      );
  });
}

/**
 * Register static assets and page routes
 *
 * In production: serve built files from out/renderer/
 * In development (localhost): proxy to Vite dev server for HMR
 * In development (LAN/remote Host): serve out/renderer/ to avoid Vite HMR reload loops
 */
export function registerStaticRoutes(expressApp: Express): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasViteDevServer =
    typeof process.env['ELECTRON_RENDERER_URL'] === 'string' && !!process.env['ELECTRON_RENDERER_URL'];
  const forceStatic = process.env.ONE_WEBUI_FORCE_STATIC === '1';
  const forceVite = process.env.ONE_WEBUI_FORCE_VITE === '1';
  const resolved = resolveRendererPath();

  if (isProduction || forceStatic) {
    if (resolved) {
      console.log(`[WebUI] Serving renderer from: ${resolved.staticRoot}`);
      registerProductionStaticRoutes(expressApp, resolved.staticRoot, resolved.indexHtml);
      return;
    }
    console.log(`[WebUI] No renderer build found, proxying UI to Vite at http://localhost:${VITE_DEV_PORT}`);
    registerViteDevProxy(expressApp);
    return;
  }

  if (!isProduction && hasViteDevServer && !forceStatic && !forceVite) {
    if (resolved) {
      // Dev hybrid: serve built static assets from out/renderer FIRST (so JS/CSS/
      // manifest.webmanifest never 502 through the Vite proxy), then let the Vite
      // proxy handle the remaining requests (HMR WebSocket, source modules that
      // only exist in Vite). Previously the Vite proxy was registered first and
      // intercepted every GET request, causing 502 for assets that only exist in
      // the build output (manifest.webmanifest) and unstable page loads.
      console.log(
        `[WebUI] Dev hybrid: static ${resolved.staticRoot} first, Vite :${VITE_DEV_PORT} fallback for localhost`
      );
      registerProductionStaticRoutes(expressApp, resolved.staticRoot, resolved.indexHtml);
      registerViteDevProxy(expressApp, true);
      return;
    }

    console.log(
      `[WebUI] Dev mode: proxying UI to Vite at http://localhost:${VITE_DEV_PORT} (run npx electron-vite build for stable LAN access)`
    );
    registerViteDevProxy(expressApp);
    registerRemoteStaticFallback(expressApp);
    return;
  }

  if (resolved) {
    console.log(`[WebUI] Serving renderer from: ${resolved.staticRoot}`);
    registerProductionStaticRoutes(expressApp, resolved.staticRoot, resolved.indexHtml);
    return;
  }

  console.log(`[WebUI] No renderer build found, proxying UI to Vite at http://localhost:${VITE_DEV_PORT}`);
  registerViteDevProxy(expressApp);
}

export default registerStaticRoutes;
