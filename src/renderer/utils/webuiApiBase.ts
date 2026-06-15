/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { captureCsrfTokenFromResponse, getCsrfToken, withCsrfHeader } from '@process/webserver/middleware/csrfClient';
import { CSRF_HEADER_NAME } from '@process/webserver/config/constants';
import { webui } from '@/common/adapter/ipcBridge';
import { buildWebuiApiBaseCandidates, type WebuiServerAddressSnapshot } from '@/common/config/webuiApiBaseCandidates';
import { resolveWebuiAdminPort } from '@/common/config/webuiLoginAccess';
import { ONE_WEBUI_CLIENT_DESKTOP, ONE_WEBUI_CLIENT_HEADER } from '@/common/config/webuiClientHeaders';
import { mergeEnterpriseApiOrigins } from '@/common/config/enterpriseApiOrigins';
import { normalizeEnterpriseApiError } from '@/renderer/utils/enterpriseApi/error';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { readEnterpriseApiOrigins, rememberEnterpriseApiOrigin } from '@/renderer/utils/rememberEnterpriseApiOrigin';
import { getDesktopWebuiBearerToken } from '@/renderer/utils/syncBrowserWebuiSession';

const AUTH_USER_BACKOFF_MS = 4000;
let authUserBackoffUntil = 0;

export function shouldSkipAuthUserRequest(): boolean {
  return Date.now() < authUserBackoffUntil;
}

export function markAuthUserRequestFailureBackoff(): void {
  authUserBackoffUntil = Date.now() + AUTH_USER_BACKOFF_MS;
}

export function clearAuthUserRequestBackoff(): void {
  authUserBackoffUntil = 0;
}

type DesktopWebuiStatus = WebuiServerAddressSnapshot & {
  running?: boolean;
  allowRemote?: boolean;
  adminLocalUrl?: string;
  adminNetworkUrl?: string;
};

async function readDesktopWebuiStatus(): Promise<DesktopWebuiStatus | null> {
  try {
    if (window.electronAPI?.webuiGetStatus) {
      const result = await window.electronAPI.webuiGetStatus();
      if (result?.success && result.data?.running && result.data.port) {
        return result.data;
      }
      return null;
    }
    const result = await webui.getStatus.invoke();
    if (result.success && result.data?.running && result.data.port) {
      return result.data;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Ordered API origins for the running desktop WebUI (loopback first, then LAN).
 */
export async function getWebuiApiBaseCandidates(): Promise<string[]> {
  if (typeof window === 'undefined' || !isElectronDesktop()) {
    return [];
  }
  const status = await readDesktopWebuiStatus();
  const stored = await readEnterpriseApiOrigins();
  if (!status?.port) {
    return stored;
  }
  // Prefer the running local WebUI over remembered remote org origins (desktop personal Issues).
  return mergeEnterpriseApiOrigins(buildWebuiApiBaseCandidates(status), stored);
}

/**
 * Base URL for WebUI HTTP APIs.
 * - Browser WebUI: current origin
 * - Electron desktop: primary loopback origin when WebUI is running
 */
export async function getWebuiApiBaseUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (!isElectronDesktop()) {
    return window.location.origin;
  }

  const candidates = await getWebuiApiBaseCandidates();
  return candidates[0] ?? null;
}

function normalizeWebuiOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Origin for opening the admin WebUI login in a browser (dedicated port when available).
 */
export async function getWebuiAdminBrowserOrigin(): Promise<string | null> {
  if (!isElectronDesktop()) {
    return typeof window !== 'undefined' ? window.location.origin : null;
  }
  const status = await readDesktopWebuiStatus();
  if (!status?.port) {
    return null;
  }
  if (status.allowRemote && status.adminNetworkUrl) {
    return normalizeWebuiOrigin(status.adminNetworkUrl);
  }
  if (status.adminLocalUrl) {
    return normalizeWebuiOrigin(status.adminLocalUrl);
  }
  const memberPort = status.port;
  const adminPort = resolveWebuiAdminPort(memberPort);
  const loopback = `http://127.0.0.1:${adminPort}`;
  if (status.allowRemote && status.lanIP) {
    return `http://${status.lanIP}:${adminPort}`;
  }
  return normalizeWebuiOrigin(loopback) ?? loopback;
}

async function getDesktopWebuiAuthHeaders(headers?: HeadersInit): Promise<HeadersInit | undefined> {
  if (!isElectronDesktop()) {
    return headers;
  }

  const merged = new Headers(headers ?? {});
  if (!merged.has(ONE_WEBUI_CLIENT_HEADER)) {
    merged.set(ONE_WEBUI_CLIENT_HEADER, ONE_WEBUI_CLIENT_DESKTOP);
  }

  const bearer = getDesktopWebuiBearerToken();
  if (bearer && !merged.has('Authorization')) {
    merged.set('Authorization', `Bearer ${bearer}`);
  }

  return Object.fromEntries(merged.entries());
}

function withCsrfFormData(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (!(body instanceof FormData)) {
    return body;
  }
  const token = getCsrfToken();
  if (token && !body.has('_csrf')) {
    body.append('_csrf', token);
  }
  return body;
}

async function headersInitToRecord(headers: HeadersInit | undefined): Promise<Record<string, string>> {
  const merged = new Headers(headers ?? {});
  return Object.fromEntries(merged.entries());
}

function captureCsrfTokenFromLoopbackHeaders(headers: Record<string, string>): void {
  const token = headers[CSRF_HEADER_NAME] ?? headers[CSRF_HEADER_NAME.toLowerCase()];
  if (!token) {
    return;
  }
  captureCsrfTokenFromResponse(
    new Response(null, {
      headers: new Headers({ [CSRF_HEADER_NAME]: token }),
    })
  );
}

async function ensureCsrfTokenForMutation(bases: string[], authHeaders: HeadersInit | undefined): Promise<void> {
  if (getCsrfToken()) {
    return;
  }
  let lastError: unknown = null;
  for (const candidate of bases) {
    try {
      const response = await fetch(`${candidate}/api/auth/login-ui`, {
        method: 'GET',
        headers: authHeaders,
        credentials: 'include',
      });
      captureCsrfTokenFromResponse(response);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('WEBUI_NOT_RUNNING');
}

async function ensureCsrfTokenViaLoopback(port: number, authHeaders: HeadersInit | undefined): Promise<void> {
  if (getCsrfToken()) {
    return;
  }
  const result = await webui.invokeLoopbackRequest.invoke({
    path: '/api/auth/login-ui',
    method: 'GET',
    headers: await headersInitToRecord(authHeaders),
  });
  if (!result.success || !result.data) {
    throw new Error('WEBUI_NOT_RUNNING');
  }
  captureCsrfTokenFromLoopbackHeaders(result.data.headers);
  if (!getCsrfToken()) {
    throw new Error('WEBUI_NOT_RUNNING');
  }
}

async function fetchWebuiApiViaLoopbackIpc(port: number, path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const authHeaders = await getDesktopWebuiAuthHeaders(init?.headers);
  const isMutation = method !== 'GET' && method !== 'HEAD';
  if (isMutation) {
    await ensureCsrfTokenViaLoopback(port, authHeaders);
  }
  const headers = isMutation
    ? await headersInitToRecord(withCsrfHeader(authHeaders))
    : await headersInitToRecord(authHeaders);
  const body = isMutation ? withCsrfFormData(init?.body ?? null) : init?.body;
  const bodyText = typeof body === 'string' ? body : undefined;

  const result = await webui.invokeLoopbackRequest.invoke({
    path,
    method,
    headers,
    body: bodyText,
  });
  if (!result.success || !result.data) {
    throw new Error(result.msg ?? 'WEBUI_NOT_RUNNING');
  }

  captureCsrfTokenFromLoopbackHeaders(result.data.headers);
  if (path === '/api/auth/user') {
    if (result.data.status === 401 || result.data.status === 403) {
      markAuthUserRequestFailureBackoff();
    } else if (result.data.ok) {
      clearAuthUserRequestBackoff();
    }
  }
  if (result.data.ok) {
    void rememberEnterpriseApiOrigin(`http://127.0.0.1:${port}`);
  }

  return new Response(result.data.bodyText, {
    status: result.data.status,
    headers: result.data.headers,
  });
}

export async function fetchWebuiApi(path: string, init?: RequestInit): Promise<Response> {
  if (isElectronDesktop()) {
    const status = await readDesktopWebuiStatus();
    if (status?.port) {
      try {
        return await fetchWebuiApiViaLoopbackIpc(status.port, path, init);
      } catch {
        // Fall back to renderer fetch when loopback IPC is unavailable.
      }
    }
  }

  const bases = isElectronDesktop() ? await getWebuiApiBaseCandidates() : [window.location.origin];
  if (bases.length === 0) {
    throw new Error('WEBUI_NOT_RUNNING');
  }

  const method = (init?.method ?? 'GET').toUpperCase();
  const authHeaders = await getDesktopWebuiAuthHeaders(init?.headers);
  const isMutation = method !== 'GET' && method !== 'HEAD';
  if (isMutation) {
    await ensureCsrfTokenForMutation(bases, authHeaders);
  }
  const headers = isMutation ? withCsrfHeader(authHeaders) : authHeaders;
  const body = isMutation ? withCsrfFormData(init?.body ?? null) : init?.body;
  const credentials =
    init?.credentials ?? (path === '/api/auth/user' && !getDesktopWebuiBearerToken() ? 'omit' : 'include');

  let lastError: unknown = null;
  for (const candidate of bases) {
    const url = path.startsWith('/') ? `${candidate}${path}` : `${candidate}/${path}`;
    try {
      const response = await fetch(url, {
        ...init,
        body,
        headers,
        credentials,
      });
      if (path === '/api/auth/user') {
        if (response.status === 401 || response.status === 403) {
          markAuthUserRequestFailureBackoff();
        } else if (response.ok) {
          clearAuthUserRequestBackoff();
        }
      }
      captureCsrfTokenFromResponse(response);
      if (response.ok) {
        void rememberEnterpriseApiOrigin(candidate);
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('WEBUI_NOT_RUNNING');
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
  if (Object.prototype.hasOwnProperty.call(body, 'data') && (body as { data?: unknown }).data !== undefined) {
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
