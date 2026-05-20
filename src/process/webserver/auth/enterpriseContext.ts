/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import {
  DEFAULT_TENANT_ID,
  isEnterpriseTenantId,
  type EnterpriseContextSnapshot,
} from '@/common/config/webuiEnterpriseConfig';

export type { EnterpriseContextSnapshot };
export { isEnterpriseTenantId };

export async function resolveEnterpriseContext(
  tenantId: string | null | undefined
): Promise<EnterpriseContextSnapshot> {
  const tid = (tenantId ?? DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
  const joined = isEnterpriseTenantId(tid);
  if (!joined) {
    return { joined: false, tenantId: DEFAULT_TENANT_ID, tenantName: null };
  }

  let tenantName: string | null = null;
  try {
    const driver = (await getDatabase()).getDriver();
    const row = driver
      .prepare('SELECT name FROM tenants WHERE id = ?')
      .get(tid) as { name?: string } | undefined;
    tenantName = typeof row?.name === 'string' ? row.name : null;
  } catch {
    tenantName = null;
  }

  return { joined: true, tenantId: tid, tenantName };
}
