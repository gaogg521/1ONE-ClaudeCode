/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type ScopeOwnershipCellProps = {
  scope?: string;
  teamId?: string | null;
  createdBy?: string;
  getTeamName: (teamId: string | null | undefined) => string;
};

function renderScopeTag(
  scope: string | undefined,
  t: (key: string, options?: { defaultValue?: string }) => string
): React.ReactNode {
  if (scope === 'organization') {
    return <Tag size='small' color='arcoblue'>{t('admin.scope.organization', { defaultValue: '组织共享' })}</Tag>;
  }
  if (scope === 'team') {
    return <Tag size='small' color='green'>{t('admin.scope.team', { defaultValue: '团队共享' })}</Tag>;
  }
  return <Tag size='small' color='gray'>{t('admin.scope.personal', { defaultValue: '个人' })}</Tag>;
}

const ScopeOwnershipCell: React.FC<ScopeOwnershipCellProps> = ({ scope, teamId, createdBy, getTeamName }) => {
  const { t } = useTranslation();

  return (
    <div className='flex flex-col gap-4px'>
      <div className='flex items-center gap-6px flex-wrap'>
        {renderScopeTag(scope, t)}
        {teamId ? (
          <Tag size='small' color='cyan'>
            {`${t('admin.scope.teamLabel', { defaultValue: '团队' })}：${getTeamName(teamId)}`}
          </Tag>
        ) : null}
      </div>
      <span className='text-12px text-t-secondary'>
        {`${t('admin.scope.createdBy', { defaultValue: '创建者' })}：${createdBy || '—'}`}
      </span>
    </div>
  );
};

export default ScopeOwnershipCell;
