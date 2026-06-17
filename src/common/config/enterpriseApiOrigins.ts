/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persists WebUI API origins used for enterprise join (invite / LDAP / Feishu SSO).
 * Enables desktop clients on different machines to sync org-scoped data (e.g. team runtime fleet)
 * against the same organization server — not only a shared local WebUI instance.
 */

import { isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';

export const ENTERPRISE_API_ORIGINS_KEY = 'webui.enterpriseApiOrigins' as const;

const MAX_STORED_ORIGINS = 8;

function normalizeOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function normalizeEnterpriseApiOrigin(url: string): string | null {
  return normalizeOrigin(url);
}

export function mergeEnterpriseApiOrigins(stored: string[] | undefined, candidates: string[]): string[] {
  const merged: string[] = [];
  for (const value of [...(stored ?? []), ...candidates]) {
    const origin = normalizeOrigin(value);
    if (origin && !merged.includes(origin)) {
      merged.push(origin);
    }
  }
  return merged.slice(0, MAX_STORED_ORIGINS);
}

/** Whether org-scoped HTTP sync should run for this tenant. */
export function shouldSyncWithEnterpriseApi(tenantId: string | null | undefined): boolean {
  return isEnterpriseTenantId(tenantId);
}
