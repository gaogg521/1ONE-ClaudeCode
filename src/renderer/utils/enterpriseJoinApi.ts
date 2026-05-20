/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import type { EnterpriseInvitePreview, EnterpriseJoinResult, EnterpriseSetupResult } from '@/common/types/enterpriseJoin';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';
import { hasValidCsrfToken, withCsrfToken } from '@process/webserver/middleware/csrfClient';

type ApiBody = {
  success?: boolean;
  data?: unknown;
  code?: string;
  message?: string;
};

/** Prime CSRF from a safe GET when the session token was not captured yet. */
async function ensureWebuiCsrfToken(): Promise<void> {
  if (hasValidCsrfToken()) return;
  await fetchWebuiApi('/api/auth/user');
}

async function parseApi<T>(res: Response): Promise<T> {
  const body = (await res.json().catch((): null => null)) as ApiBody | null;
  if (!res.ok || !body?.success) {
    const err = new Error(body?.message || res.statusText);
    (err as Error & { code?: string }).code = body?.code;
    throw err;
  }
  return body.data as T;
}

export async function previewEnterpriseInvite(code: string): Promise<EnterpriseInvitePreview> {
  if (isElectronDesktop()) {
    const result = await webui.previewEnterpriseInvite.invoke({ code });
    if (!result.success || !result.data) {
      throw new Error(result.msg || 'Preview failed');
    }
    return result.data;
  }
  const res = await fetchWebuiApi(
    `/api/auth/enterprise-invite/preview?code=${encodeURIComponent(code)}`
  );
  return parseApi<EnterpriseInvitePreview>(res);
}

export async function joinEnterpriseWithCode(code: string): Promise<EnterpriseJoinResult> {
  if (isElectronDesktop()) {
    const result = await webui.joinEnterprise.invoke({ code });
    if (!result.success || !result.data) {
      throw new Error(result.msg || 'Join failed');
    }
    return result.data;
  }
  await ensureWebuiCsrfToken();
  const res = await fetchWebuiApi('/api/auth/enterprise-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({ code })),
  });
  return parseApi<EnterpriseJoinResult>(res);
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
  const res = await fetchWebuiApi('/api/admin/enterprise/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({ name })),
  });
  return parseApi<EnterpriseSetupResult>(res);
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
  const res = await fetchWebuiApi('/api/admin/enterprise/invites');
  return parseApi<EnterpriseInviteListItem[]>(res);
}

export async function createEnterpriseInvite(input: {
  maxUses?: number;
  expiresInDays?: number;
}): Promise<{ displayCode: string }> {
  const res = await fetchWebuiApi('/api/admin/enterprise/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken(input)),
  });
  const data = await parseApi<{ displayCode?: string; invite?: { code?: string } }>(res);
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
  const res = await fetchWebuiApi(`/api/admin/enterprise/invites/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({})),
  });
  await parseApi(res);
}
