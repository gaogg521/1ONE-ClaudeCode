/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import type { EnterpriseInvitePreview, EnterpriseJoinResult, EnterpriseSetupResult } from '@/common/types/enterpriseJoin';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  fetchWebuiApi,
  fetchWebuiApiJson,
  getClientEnterpriseServerOrigin,
  getWebuiApiBaseUrl,
  readWebuiApiErrorMessage,
} from '@/renderer/utils/webuiApiBase';
import { rememberEnterpriseApiOrigin } from '@/renderer/utils/rememberEnterpriseApiOrigin';
import { hasValidCsrfToken, withCsrfToken } from '@process/webserver/middleware/csrfClient';

/** Fetch JSON from an absolute URL on the remote enterprise server.
 *  Hard 5s timeout — without it, a half-open TCP connection (server accepts
 *  handshake but never responds) makes the renderer's network thread pool
 *  fill up across poll iterations, freezing every subsequent fetch. */
export async function fetchRemoteEnterpriseJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(5000),
  });
  const body = (await res.json().catch((): null => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = readWebuiApiErrorMessage(body, res);
    const err = Object.assign(new Error(msg), {
      code: typeof body?.code === 'string' ? body.code : undefined,
    });
    throw err;
  }
  if (body && 'success' in body && body.success === false) {
    const msg = readWebuiApiErrorMessage(body, res);
    const err = Object.assign(new Error(msg), {
      code: typeof body?.code === 'string' ? body.code : undefined,
    });
    throw err;
  }
  if (body && 'success' in body && body.success === true && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

/** Prime CSRF from a safe GET when the session token was not captured yet. */
async function ensureWebuiCsrfToken(): Promise<void> {
  if (hasValidCsrfToken()) return;
  await fetchWebuiApi('/api/auth/user');
}

export async function previewEnterpriseInvite(code: string): Promise<EnterpriseInvitePreview> {
  if (isElectronDesktop()) {
    // Client mode: preview against the remote enterprise server instead of the local DB.
    const remoteOrigin = await getClientEnterpriseServerOrigin();
    if (remoteOrigin) {
      const data = await fetchRemoteEnterpriseJson<EnterpriseInvitePreview>(
        `${remoteOrigin}/api/auth/enterprise-invite/preview?code=${encodeURIComponent(code)}`
      );
      return { ...data, valid: data.valid ?? true };
    }
    const result = await webui.previewEnterpriseInvite.invoke({ code });
    if (!result.success || !result.data) {
      throw new Error(result.msg || 'Preview failed');
    }
    return { ...result.data, valid: result.data.valid ?? true };
  }
  return fetchWebuiApiJson<EnterpriseInvitePreview>(
    `/api/auth/enterprise-invite/preview?code=${encodeURIComponent(code)}`
  );
}

export async function joinEnterpriseWithCode(code: string): Promise<EnterpriseJoinResult> {
  if (isElectronDesktop()) {
    // Client mode: join against the remote enterprise server.
    const remoteOrigin = await getClientEnterpriseServerOrigin();
    if (remoteOrigin) {
      const joined = await fetchRemoteEnterpriseJson<EnterpriseJoinResult>(
        `${remoteOrigin}/api/auth/enterprise-join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          credentials: 'include',
        }
      );
      await rememberEnterpriseApiOrigin(remoteOrigin);
      return joined;
    }
    const result = await webui.joinEnterprise.invoke({ code });
    if (!result.success || !result.data) {
      throw new Error(result.msg || 'Join failed');
    }
    const base = await getWebuiApiBaseUrl();
    if (base) {
      await rememberEnterpriseApiOrigin(base);
    }
    return result.data;
  }
  await ensureWebuiCsrfToken();
  const joined = await fetchWebuiApiJson<EnterpriseJoinResult>('/api/auth/enterprise-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({ code })),
  });
  if (typeof window !== 'undefined') {
    await rememberEnterpriseApiOrigin(window.location.origin);
  }
  return joined;
}

export async function createEnterprise(name: string): Promise<EnterpriseSetupResult> {
  if (isElectronDesktop()) {
    const result = await webui.createEnterprise.invoke({ name });
    if (!result.success || !result.data) {
      throw new Error(result.msg || 'Create failed');
    }
    return result.data;
  }
  await ensureWebuiCsrfToken();
  return fetchWebuiApiJson<EnterpriseSetupResult>('/api/admin/enterprise/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({ name })),
  });
}

export type EnterpriseInviteListItem = {
  id: string;
  tenant_id: string;
  code: string;
  display_code: string;
  max_uses: number | null;
  use_count: number;
  expires_at: number | null;
  created_at: number;
  revoked: boolean;
};

export async function listEnterpriseInvites(): Promise<EnterpriseInviteListItem[]> {
  return fetchWebuiApiJson<EnterpriseInviteListItem[]>('/api/admin/enterprise/invites');
}

export async function createEnterpriseInvite(input: {
  maxUses?: number;
  expiresInDays?: number;
}): Promise<{ displayCode: string }> {
  await ensureWebuiCsrfToken();
  const data = await fetchWebuiApiJson<{ displayCode?: string; invite?: { code?: string } }>(
    '/api/admin/enterprise/invites',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withCsrfToken(input)),
    }
  );
  const displayCode =
    data.displayCode ??
    (data.invite?.code
      ? data.invite.code.length > 4
        ? `${data.invite.code.slice(0, 4)}-${data.invite.code.slice(4)}`
        : data.invite.code
      : '');
  return { displayCode };
}

export async function revokeEnterpriseInvite(id: string): Promise<void> {
  await ensureWebuiCsrfToken();
  await fetchWebuiApiJson(`/api/admin/enterprise/invites/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({})),
  });
}
