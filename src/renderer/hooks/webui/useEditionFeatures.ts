/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import type { WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';

export type EditionFeatures = {
  managementMode: WebuiManagementMode;
  isPersonalEdition: boolean;
  isEnterpriseEdition: boolean;
  hasJoinedEnterprise: boolean;
  tenantLabel: string | null;
  /** 已加入企业：主工作台显示「团队」等企业协作能力，不再要求先切版 */
  showTeamsFeature: boolean;
  showEnterpriseAdminNav: boolean;
};

export function useEditionFeatures(): EditionFeatures {
  const {
    loading,
    managementMode,
    hasJoinedEnterprise,
    enterpriseContext,
    showEnterpriseAdminNav,
  } = useWebuiEnterpriseMode();

  return useMemo(() => {
    const isEnterpriseEdition = managementMode === 'enterprise';
    const isPersonalEdition = !isEnterpriseEdition;
    const tenantLabel =
      enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? null;
    const showTeamsFeature = hasJoinedEnterprise;

    return {
      managementMode,
      isPersonalEdition,
      isEnterpriseEdition,
      hasJoinedEnterprise,
      tenantLabel: loading ? null : tenantLabel,
      showTeamsFeature,
      showEnterpriseAdminNav,
    };
  }, [
    enterpriseContext?.tenantId,
    enterpriseContext?.tenantName,
    hasJoinedEnterprise,
    loading,
    managementMode,
    showEnterpriseAdminNav,
  ]);
}
