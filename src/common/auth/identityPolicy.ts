/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EnterpriseContextSnapshot, WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import { isEnterpriseTenantId } from '@/common/config/webuiEnterpriseConfig';
import { DESKTOP_OPERATOR_USER_ID, isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';

export type IdentityKind = 'anonymous' | 'desktop_operator' | 'webui_local' | 'enterprise_member' | 'enterprise_admin';

export type EditionCapability =
  | 'personal.workspace'
  | 'enterprise.workspace'
  | 'teams.collaboration'
  | 'admin.console'
  | 'resources.org'
  | 'personal.agents'
  | 'workspace.agents'
  | 'issues.personal'
  | 'issues.teamPlanning'
  | 'skills.local'
  | 'skills.org'
  | 'rag.personal'
  | 'rag.org'
  | 'mcp.personal'
  | 'mcp.org';

export type IdentityPolicyPrincipal = {
  id: string;
  username?: string;
  tenant_id?: string;
  role?: string;
};

export type IdentitySnapshot = {
  kind: IdentityKind;
  userId: string | null;
  username: string | null;
  role: string | undefined;
  tenantId: string;
  tenantName: string | null;
  joinedByUserIdentity: boolean;
  joinedByInstanceContext: boolean;
  joinedEnterprise: boolean;
  managementMode: WebuiManagementMode;
};

export type ResolveIdentitySnapshotInput = {
  user: IdentityPolicyPrincipal | null | undefined;
  enterpriseContext: EnterpriseContextSnapshot | null | undefined;
  managementMode: WebuiManagementMode;
};

export type EditionGate = {
  identity: IdentitySnapshot;
  can: (capability: EditionCapability) => boolean;
};

export type CreateEditionGateInput = {
  identity: IdentitySnapshot;
};

function resolveTenantId(
  user: IdentityPolicyPrincipal | null | undefined,
  enterpriseContext: EnterpriseContextSnapshot | null | undefined
): string {
  return enterpriseContext?.tenantId ?? user?.tenant_id ?? 'default';
}

function resolveRole(
  user: IdentityPolicyPrincipal | null | undefined,
  enterpriseContext: EnterpriseContextSnapshot | null | undefined
): string | undefined {
  return enterpriseContext?.role ?? user?.role;
}

export function resolveIdentitySnapshot({
  user,
  enterpriseContext,
  managementMode,
}: ResolveIdentitySnapshotInput): IdentitySnapshot {
  const tenantId = resolveTenantId(user, enterpriseContext);
  const role = resolveRole(user, enterpriseContext);
  const joinedByUserIdentity = user?.id !== DESKTOP_OPERATOR_USER_ID && isEnterpriseTenantId(user?.tenant_id);
  const joinedByInstanceContext = enterpriseContext?.joined === true;
  const joinedEnterprise = joinedByUserIdentity;

  let kind: IdentityKind = 'anonymous';
  if (user?.id === DESKTOP_OPERATOR_USER_ID) {
    kind = 'desktop_operator';
  } else if (user && isEnterpriseAdminRole(role)) {
    kind = 'enterprise_admin';
  } else if (user && joinedEnterprise) {
    kind = 'enterprise_member';
  } else if (user) {
    kind = 'webui_local';
  }

  return {
    kind,
    userId: user?.id ?? null,
    username: user?.username ?? null,
    role,
    tenantId,
    tenantName: enterpriseContext?.tenantName ?? null,
    joinedByUserIdentity,
    joinedByInstanceContext,
    joinedEnterprise,
    managementMode,
  };
}

export function createEditionGate({ identity }: CreateEditionGateInput): EditionGate {
  const isEnterpriseUser = identity.kind === 'enterprise_member' || identity.kind === 'enterprise_admin';
  const enterpriseWorkspace = identity.managementMode === 'enterprise' && identity.joinedEnterprise && isEnterpriseUser;
  const adminConsole = identity.kind === 'enterprise_admin';

  return {
    identity,
    can: (capability) => {
      switch (capability) {
        case 'personal.workspace':
        case 'personal.agents':
        case 'issues.personal':
        case 'skills.local':
        case 'rag.personal':
        case 'mcp.personal':
          return true;
        case 'enterprise.workspace':
        case 'teams.collaboration':
        case 'workspace.agents':
        case 'issues.teamPlanning':
          return enterpriseWorkspace;
        case 'admin.console':
          return adminConsole;
        case 'resources.org':
        case 'skills.org':
        case 'rag.org':
        case 'mcp.org':
          return enterpriseWorkspace || adminConsole;
      }
    },
  };
}
