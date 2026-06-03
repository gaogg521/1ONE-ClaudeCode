/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request } from 'express';
import { isElectronDesktopWebuiRequest } from '@/common/config/webuiClientHeaders';
import { resolveLanIp } from '@/common/utils/resolveLanIp';

function isLocalAddress(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '::1' || normalized === '::ffff:127.0.0.1') {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return mapped === '127.0.0.1';
  }
  return normalized === '127.0.0.1' || normalized === 'localhost';
}

function parseHostHeader(value: unknown): { hostname: string; port: number | null } {
  if (typeof value !== 'string' || value.trim() === '') {
    return { hostname: '', port: null };
  }
  const raw = value.trim().toLowerCase();
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    const hostname = end >= 0 ? raw.slice(1, end) : raw;
    const portPart = end >= 0 && raw[end + 1] === ':' ? raw.slice(end + 2) : '';
    const port = portPart ? Number.parseInt(portPart, 10) : null;
    return { hostname, port: Number.isFinite(port) ? port : null };
  }
  const [hostname, portPart] = raw.split(':');
  const port = portPart ? Number.parseInt(portPart, 10) : null;
  return { hostname: hostname ?? '', port: Number.isFinite(port) ? port : null };
}

function isLocalHostHeader(value: unknown): boolean {
  const { hostname } = parseHostHeader(value);
  if (!hostname) {
    return true;
  }
  return isLocalAddress(hostname);
}

function isSameMachineLanHost(value: unknown): boolean {
  const { hostname } = parseHostHeader(value);
  if (!hostname) {
    return false;
  }
  const lanIp = resolveLanIp();
  return Boolean(lanIp && hostname === lanIp.toLowerCase());
}

/**
 * Allow unauthenticated Issues/DevOps on loopback (personal edition / desktop operator / browser guest).
 */
export function canUseAnonymousLocalDevops(req: Pick<Request, 'headers' | 'ip' | 'socket'>): boolean {
  const remoteAddress = req.ip || req.socket?.remoteAddress;
  if (!isLocalAddress(remoteAddress)) {
    return false;
  }
  if (isLocalHostHeader(req.headers.host)) {
    return true;
  }
  // Desktop renderer may call the LAN URL while the TCP peer is still loopback.
  if (isElectronDesktopWebuiRequest(req.headers as Record<string, unknown>) && isSameMachineLanHost(req.headers.host)) {
    return true;
  }
  return false;
}
