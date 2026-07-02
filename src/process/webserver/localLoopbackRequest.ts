/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * Main-process HTTP to the embedded WebUI on loopback.
 * Avoids renderer fetch CORS / private-network restrictions on Electron desktop.
 */

import { net } from 'electron';
import {
  ONE_WEBUI_CLIENT_DESKTOP,
  ONE_WEBUI_CLIENT_HEADER,
} from '@/common/config/webuiClientHeaders';
import { CSRF_HEADER_NAME } from '@process/webserver/config/constants';

export type LoopbackRequestInput = {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type LoopbackRequestResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

function normalizeLoopbackPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

export async function invokeLoopbackRequest(input: LoopbackRequestInput): Promise<LoopbackRequestResult> {
  const url = `http://127.0.0.1:${input.port}${normalizeLoopbackPath(input.path)}`;
  const method = (input.method ?? 'GET').toUpperCase();
  const headers = new Headers(input.headers ?? {});
  if (!headers.has(ONE_WEBUI_CLIENT_HEADER)) {
    headers.set(ONE_WEBUI_CLIENT_HEADER, ONE_WEBUI_CLIENT_DESKTOP);
  }
  // Chromium net.fetch rejects manually set forbidden headers (e.g. Host).
  headers.delete('host');
  headers.delete('Host');

  const response = await net.fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : input.body,
    bypassCustomProtocolHandlers: true,
  } as RequestInit & { bypassCustomProtocolHandlers?: boolean });

  // Read body within a timeout — net.fetch has no built-in timeout, and a
  // half-open TCP connection to the loopback server hangs the IPC call forever,
  // which freezes the renderer (spinner spins indefinitely on Issue creation).
  const bodyText = await Promise.race([
    response.text(),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('LOOPBACK_TIMEOUT')), 15_000)
    ),
  ]) as string;
  const headerRecord = headersToRecord(response.headers);
  if (!headerRecord[CSRF_HEADER_NAME] && response.headers.has(CSRF_HEADER_NAME)) {
    headerRecord[CSRF_HEADER_NAME] = response.headers.get(CSRF_HEADER_NAME) ?? '';
  }

  return {
    ok: response.ok,
    status: response.status,
    headers: headerRecord,
    bodyText,
  };
}
