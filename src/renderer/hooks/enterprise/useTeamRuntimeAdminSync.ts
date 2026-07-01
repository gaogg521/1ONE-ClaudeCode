/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { publishRuntimeToAdminBackend } from '@/renderer/services/teamRuntimeAdminSync';

const HEARTBEAT_MS = 60_000;

/**
 * 企业成员登录后（C/S 或 B/S）持续向超级管理员后台同步本端运行时信息。
 *
 * 客户端模式下，设备只要配置了服务器地址就上线（不要求 SSO 登录成功）——
 * 让服务端看到这台设备，认证状态由心跳 payload 的 authenticated 字段区分。
 * SSO 登录后同一 machineId 自动升级为认证成员。
 */
export function useTeamRuntimeAdminSync(): void {
  const { user } = useAuth();
  const { identity, hasJoinedEnterprise, isClientModeConnected } = useEditionFeatures();
  const tenantId = identity.tenantId;
  const userId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
  const channel = isElectronDesktop() ? 'desktop' : 'browser';

  useEffect(() => {
    // SSO-signed-in member OR client-mode device that has configured the server URL.
    // The latter reports as "pending" so the admin can see it before the user logs in.
    const shouldPublish = hasJoinedEnterprise || isClientModeConnected;
    if (!shouldPublish || !userId) {
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      void publishRuntimeToAdminBackend({
        tenantId,
        userId,
        channel,
        authenticated: hasJoinedEnterprise,
      });
    };

    tick();
    const timer = window.setInterval(tick, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channel, hasJoinedEnterprise, isClientModeConnected, tenantId, userId]);
}
