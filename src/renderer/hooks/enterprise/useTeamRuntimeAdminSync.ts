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
 */
export function useTeamRuntimeAdminSync(): void {
  const { user } = useAuth();
  const { identity, hasJoinedEnterprise } = useEditionFeatures();
  const tenantId = identity.tenantId;
  const userId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
  const channel = isElectronDesktop() ? 'desktop' : 'browser';

  useEffect(() => {
    if (!hasJoinedEnterprise || !userId) {
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      void publishRuntimeToAdminBackend({ tenantId, userId, channel });
    };

    tick();
    const timer = window.setInterval(tick, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channel, hasJoinedEnterprise, tenantId, userId]);
}
