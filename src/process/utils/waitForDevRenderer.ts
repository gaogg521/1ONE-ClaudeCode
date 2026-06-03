/**
 * Poll the Vite dev server until it accepts HTTP connections (Electron starts before Vite is ready).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';

export async function waitForDevRendererUrl(rendererUrl: string, maxWaitMs = 90_000): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(rendererUrl);
  } catch {
    return false;
  }

  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const host = target.hostname;
  const path = target.pathname && target.pathname !== '/' ? target.pathname : '/';
  const deadline = Date.now() + maxWaitMs;

  const probe = (): Promise<boolean> =>
    new Promise((resolve) => {
      const req = http.request(
        { hostname: host, port, path, method: 'GET', timeout: 3000 },
        (res) => {
          res.resume();
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });

  while (Date.now() < deadline) {
    if (await probe()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
}
