/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NavigateFunction } from 'react-router-dom';
import type { WebuiManagementMode } from '@/common/config/webuiEnterpriseConfig';
import { appNavigate } from '@/renderer/utils/appNavigate';

export function navigateAfterEditionSwitch(input: {
  next: WebuiManagementMode;
  navigate: NavigateFunction;
  isDesktop: boolean;
  hasJoinedEnterprise: boolean;
  hasInstanceEnterprise: boolean;
  isAuthenticated: boolean;
  isDesktopOperator: boolean;
  currentPath?: string;
  onAlreadyAtTarget?: (path: string) => void;
}): void {
  const targetPath =
    input.next === 'enterprise' && !input.hasJoinedEnterprise && !input.hasInstanceEnterprise
      ? '/enterprise/join'
      : '/sessions';
  if (input.currentPath === targetPath) {
    input.onAlreadyAtTarget?.(targetPath);
  }
  appNavigate(input.navigate, targetPath);
}
