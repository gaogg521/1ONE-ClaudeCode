/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type WebuiServerAddressSnapshot = {
  port: number;
  localUrl?: string;
  networkUrl?: string;
  lanIP?: string;
};

function normalizeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function pushOrigin(candidates: string[], url: string | undefined): void {
  if (!url) {
    return;
  }
  const origin = normalizeOrigin(url);
  if (origin && !candidates.includes(origin)) {
    candidates.push(origin);
  }
}

/**
 * Ordered WebUI API origins for the desktop client.
 * Loopback hosts first (anonymous local DevOps); LAN URL last as fallback.
 */
export function buildWebuiApiBaseCandidates(snapshot: WebuiServerAddressSnapshot): string[] {
  const candidates: string[] = [];
  pushOrigin(candidates, snapshot.localUrl);
  pushOrigin(candidates, `http://127.0.0.1:${snapshot.port}`);
  pushOrigin(candidates, `http://localhost:${snapshot.port}`);
  pushOrigin(candidates, snapshot.networkUrl);
  if (snapshot.lanIP) {
    pushOrigin(candidates, `http://${snapshot.lanIP}:${snapshot.port}`);
  }
  return candidates;
}

/** Cookie lookup URLs for syncing a browser WebUI login into Electron. */
export function buildWebuiSessionCookieUrls(snapshot: WebuiServerAddressSnapshot): string[] {
  return buildWebuiApiBaseCandidates(snapshot);
}
