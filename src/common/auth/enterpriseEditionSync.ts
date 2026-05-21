/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  WEBUI_MANAGEMENT_MODE_KEY,
  type EnterpriseContextSnapshot,
  type WebuiManagementMode,
} from '@/common/config/webuiEnterpriseConfig';
import { ConfigStorage } from '@/common/config/storage';
import { hasEnterpriseTenant, isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';

/** 加入企业或企业租户登录后，将工作区版本切到「企业版」。 */
export async function persistEnterpriseWorkspaceEdition(): Promise<void> {
  const mode: WebuiManagementMode = 'enterprise';
  await ConfigStorage.set(WEBUI_MANAGEMENT_MODE_KEY, mode);
}

export function shouldUseEnterpriseWorkspaceEdition(
  tenantId: string | undefined,
  currentMode: WebuiManagementMode
): boolean {
  return hasEnterpriseTenant(tenantId) && currentMode !== 'enterprise';
}

/**
 * 桌面端：合并本地 IPC 与浏览器 WebUI 会话。
 * 本地 admin 的组织管理员角色优先保留，避免浏览器用普通成员登录后「挤掉」管理入口。
 */
export function mergeDesktopEnterpriseContext(
  ipc: EnterpriseContextSnapshot,
  browser: EnterpriseContextSnapshot | null
): EnterpriseContextSnapshot {
  const ipcJoined = ipc.joined === true;
  const browserJoined = browser?.joined === true;
  if (!ipcJoined && !browserJoined) {
    return ipc;
  }

  const joined = ipcJoined || browserJoined;
  const preferBrowserTenant = browserJoined && !ipcJoined;
  const tenantId = preferBrowserTenant ? (browser?.tenantId ?? ipc.tenantId) : ipc.tenantId;
  const tenantName = preferBrowserTenant
    ? (browser?.tenantName ?? ipc.tenantName)
    : (ipc.tenantName ?? browser?.tenantName ?? null);

  const ipcRole = ipc.role;
  const browserRole = browser?.role;
  let role = browserRole ?? ipcRole;
  if (isEnterpriseAdminRole(ipcRole) && !isEnterpriseAdminRole(browserRole)) {
    role = ipcRole;
  }

  return {
    joined,
    tenantId,
    tenantName,
    role,
    canCreateEnterprise: ipc.canCreateEnterprise ?? browser?.canCreateEnterprise,
  };
}
