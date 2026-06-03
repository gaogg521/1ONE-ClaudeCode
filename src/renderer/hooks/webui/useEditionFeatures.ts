/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import {
  createEditionGate,
  resolveIdentitySnapshot,
  type EditionCapability,
  type EditionGate,
  type IdentitySnapshot,
} from '@/common/auth/identityPolicy';
import type { WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';

export type EditionFeatures = {
  managementMode: WebuiManagementMode;
  identity: IdentitySnapshot;
  gate: EditionGate;
  can: (capability: EditionCapability) => boolean;
  isPersonalEdition: boolean;
  isEnterpriseEdition: boolean;
  hasInstanceEnterprise: boolean;
  hasJoinedEnterprise: boolean;
  tenantLabel: string | null;
  /** 仅企业团队版且已加入企业时显示「团队」等企业协作能力 */
  showTeamsFeature: boolean;
  showEnterpriseAdminNav: boolean;
  /** 工作区「企业协同与平台能力」区块：已加入企业、实例已接入企业，或管理后台入口 */
  showEnterpriseWorkspaceHub: boolean;
};

export function useEditionFeatures(): EditionFeatures {
  const { user } = useAuth();
  const {
    loading,
    managementMode,
    hasInstanceEnterprise,
    hasJoinedEnterprise,
    enterpriseContext,
    showEnterpriseAdminNav,
  } = useWebuiEnterpriseMode();

  return useMemo(() => {
    const identity = resolveIdentitySnapshot({
      user,
      enterpriseContext,
      managementMode,
    });
    const gate = createEditionGate({ identity });
    const isEnterpriseEdition = managementMode === 'enterprise';
    const isPersonalEdition = !isEnterpriseEdition;
    const tenantLabel =
      enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? null;
    const showTeamsFeature = gate.can('teams.collaboration');
    const showEnterpriseWorkspaceHub =
      hasJoinedEnterprise || hasInstanceEnterprise || showEnterpriseAdminNav;

    return {
      managementMode,
      identity,
      gate,
      can: gate.can,
      isPersonalEdition,
      isEnterpriseEdition,
      hasInstanceEnterprise,
      hasJoinedEnterprise,
      tenantLabel: loading ? null : tenantLabel,
      showTeamsFeature,
      showEnterpriseAdminNav,
      showEnterpriseWorkspaceHub,
    };
  }, [
    enterpriseContext?.tenantId,
    enterpriseContext?.tenantName,
    hasInstanceEnterprise,
    hasJoinedEnterprise,
    loading,
    managementMode,
    showEnterpriseAdminNav,
    user,
  ]);
}
