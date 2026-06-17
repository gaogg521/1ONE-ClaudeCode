/**
 * Instance-level system_admin governance (bootstrap claim + safety checks).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSystemAdminRole } from '@/common/auth/enterpriseRoles';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';

export type InstanceGovernanceSnapshot = {
  hasSystemAdmin: boolean;
  canClaimSystemAdmin: boolean;
};

export async function countSystemAdmins(): Promise<number> {
  return UserRepository.countByRole('system_admin');
}

export async function getInstanceGovernance(userRole: string | undefined): Promise<InstanceGovernanceSnapshot> {
  const hasSystemAdmin = (await countSystemAdmins()) > 0;
  const canClaimSystemAdmin =
    !hasSystemAdmin && !isSystemAdminRole(userRole) && (userRole === 'org_admin' || userRole === 'admin');
  return { hasSystemAdmin, canClaimSystemAdmin };
}

export async function claimSystemAdmin(userId: string, userRole: string | undefined): Promise<void> {
  const governance = await getInstanceGovernance(userRole);
  if (!governance.canClaimSystemAdmin) {
    throw new InstanceGovernanceError(
      'CLAIM_NOT_ALLOWED',
      '当前无法认领系统管理员：实例已有系统管理员，或您的账号不具备认领资格（需为组织管理员）。'
    );
  }
  await UserRepository.setRole(userId, 'system_admin');
  console.log(`[Governance] User ${userId} claimed system_admin (bootstrap)`);
}

export async function assertCanRevokeSystemAdmin(userId: string): Promise<void> {
  const user = await UserRepository.findById(userId);
  if (!user || !isSystemAdminRole(user.role)) {
    return;
  }
  const total = await countSystemAdmins();
  if (total <= 1) {
    throw new InstanceGovernanceError(
      'LAST_SYSTEM_ADMIN',
      '不能关闭最后一名系统管理员。请先为其他用户开启系统管理员，或让其他系统管理员接管。'
    );
  }
}

export class InstanceGovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'InstanceGovernanceError';
  }
}
