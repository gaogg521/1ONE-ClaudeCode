/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from 'i18next';

export function formatEnterpriseRole(
  role: string | undefined,
  t: TFunction
): string {
  if (role === 'system_admin') {
    return t('settings.enterpriseConsole.roleSystemAdmin', { defaultValue: '系统管理员' });
  }
  if (role === 'org_admin' || role === 'admin') {
    return t('settings.enterpriseConsole.roleOrgAdmin', { defaultValue: '组织管理员' });
  }
  return t('settings.enterpriseConsole.roleMember', { defaultValue: '成员' });
}
