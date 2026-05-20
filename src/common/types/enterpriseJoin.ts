/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type EnterpriseInvitePreview = {
  tenantId: string;
  tenantName: string;
};

export type EnterpriseInviteRecord = {
  id: string;
  tenant_id: string;
  code: string;
  created_by: string;
  max_uses: number | null;
  use_count: number;
  expires_at: number | null;
  created_at: number;
  revoked: boolean;
};

export type EnterpriseJoinResult = {
  tenantId: string;
  tenantName: string | null;
};

export type EnterpriseSetupResult = {
  tenantId: string;
  tenantName: string;
};
