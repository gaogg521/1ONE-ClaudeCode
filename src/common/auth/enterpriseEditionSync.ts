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
import { hasEnterpriseTenant } from '@/common/auth/enterpriseRoles';

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
 * 桌面端合并本地 IPC 快照与浏览器 WebUI 会话快照。
 *
 * 合并优先级：
 * 1. 本机已加入企业（ipc.joined）→ 以本机为准。server 模式下本机创建企业后，
 *    system_default_user.tenant_id 就是企业 id，无论当前 SSO 登录的 user 是否已
 *    加入企业，本机实例的企业身份不变。避免 SSO user 尚未 ensureUserJoinedDefaultEnterprise
 *    时 browserCtx.tenantId='default' 覆盖本机企业，导致概览页显示「单机实例」。
 * 2. 否则浏览器会话非空 → 用 browser（客户端模式远程 SSO 权威）。
 * 3. 都没有 → 回退 ipc。
 */
export function mergeDesktopEnterpriseContext(
  ipc: EnterpriseContextSnapshot,
  browser: EnterpriseContextSnapshot | null
): EnterpriseContextSnapshot {
  if (ipc.joined) {
    return {
      ...ipc,
      canCreateEnterprise: ipc.canCreateEnterprise ?? browser?.canCreateEnterprise,
    };
  }
  if (browser) {
    return {
      ...browser,
      canCreateEnterprise: browser.canCreateEnterprise ?? ipc.canCreateEnterprise,
    };
  }
  return ipc;
}
