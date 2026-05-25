/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { captureCsrfTokenFromResponse } from '@process/webserver/middleware/csrfClient';
import { webui } from '@/common/adapter/ipcBridge';
import { normalizeEnterpriseApiError } from '@/renderer/utils/enterpriseApi/error';
import { isElectronDesktop } from '@/renderer/utils/platform';

/**
 * Base URL for WebUI HTTP APIs.
 * - Browser WebUI: current origin
 * - Electron desktop: local WebUI server when running
 */
export async function getWebuiApiBaseUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (!isElectronDesktop()) {
    return window.location.origin;
  }

  try {
    let status: { running?: boolean; port?: number } | null = null;
    if (window.electronAPI?.webuiGetStatus) {
      const result = await window.electronAPI.webuiGetStatus();
      if (result?.success && result.data) {
        status = result.data;
      }
    } else {
      const result = await webui.getStatus.invoke();
      if (result.success && result.data) {
        status = result.data;
      }
    }
    if (status?.running && status.port) {
      return `http://127.0.0.1:${status.port}`;
    }
  } catch {
    // ignore
  }
  return null;
}

async function getDesktopWebuiAuthHeaders(headers?: HeadersInit): Promise<HeadersInit | undefined> {
  if (!isElectronDesktop()) {
    return headers;
  }

  try {
    const result = await webui.getDesktopSessionToken.invoke();
    const token = result.success ? result.data?.token : undefined;
    if (!token) {
      return headers;
    }

    const mergedHeaders = new Headers(headers ?? {});
    if (!mergedHeaders.has('Authorization')) {
      mergedHeaders.set('Authorization', `Bearer ${token}`);
    }
    return Object.fromEntries(mergedHeaders.entries());
  } catch {
    return headers;
  }
}

export async function fetchWebuiApi(path: string, init?: RequestInit): Promise<Response> {
  const base = await getWebuiApiBaseUrl();
  if (!base) {
    throw new Error('WEBUI_NOT_RUNNING');
  }
  const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: await getDesktopWebuiAuthHeaders(init?.headers),
    credentials: 'include',
  });
  captureCsrfTokenFromResponse(response);
  return response;
}

/** Error thrown by {@link fetchWebuiApiJson} with HTTP metadata when available */
export type WebuiApiJsonError = Error & { status?: number; code?: string };

/**
 * Normalize API error payloads: `message`, `error` (express AppError/global handler), then status text.
 */
/** Map common admin API failures to user-facing hints. */
export function formatWebuiAdminError(error: unknown): string {
  const issue = normalizeEnterpriseApiError(error);
  return issue.message;
}

export function readWebuiApiErrorMessage(body: Record<string, unknown> | null, res: Response): string {
  if (!body) {
    return res.statusText;
  }
  const m = typeof body.message === 'string' ? body.message.trim() : '';
  const e = typeof body.error === 'string' ? body.error.trim() : '';
  return m || e || res.statusText;
}

function unwrapSuccessEnvelope<T>(body: Record<string, unknown>): T {
  if (
    Object.prototype.hasOwnProperty.call(body, 'data') &&
    (body as { data?: unknown }).data !== undefined
  ) {
    return (body as { data: T }).data;
  }
  return body as unknown as T;
}

/**
 * Call WebUI REST with correct base URL, capture CSRF from `x-csrf-token`, and unwrap `{ success, data }`.
 *
 * - HTTP error or `success === false`: throws {@link WebuiApiJsonError} with `status`/`code`.
 * - 2xx JSON **without** a `success` field (legacy/raw handlers): returns the parsed body as `T`.
 */
export async function fetchWebuiApiJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWebuiApi(path, init);
  const body = (await res.json().catch((): null => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    const msg = readWebuiApiErrorMessage(body, res);
    const err = new Error(msg) as WebuiApiJsonError;
    err.status = res.status;
    err.code = typeof body?.code === 'string' ? body.code : undefined;
    throw err;
  }

  if (body && typeof body === 'object' && 'success' in body && body.success === false) {
    const msg = readWebuiApiErrorMessage(body, res);
    const err = new Error(msg) as WebuiApiJsonError;
    err.status = res.status;
    err.code = typeof body?.code === 'string' ? body.code : undefined;
    throw err;
  }

  if (body && typeof body === 'object' && 'success' in body && body.success === true) {
    return unwrapSuccessEnvelope<T>(body);
  }

  return body as T;
}
