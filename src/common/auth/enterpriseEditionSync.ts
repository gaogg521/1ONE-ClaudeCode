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
 * 桌面端：浏览器 WebUI 会话为唯一权威；无浏览器会话时回退本地 IPC 快照。
 */
export function mergeDesktopEnterpriseContext(
  ipc: EnterpriseContextSnapshot,
  browser: EnterpriseContextSnapshot | null
): EnterpriseContextSnapshot {
  if (browser) {
    return {
      ...browser,
      canCreateEnterprise: browser.canCreateEnterprise ?? ipc.canCreateEnterprise,
    };
  }
  return ipc;
}
