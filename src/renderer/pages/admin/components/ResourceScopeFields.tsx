/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Form, Select } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TeamRecord } from '@/renderer/utils/enterpriseApi/modules';

export type ResourceScopeValue = {
  scope: string;
  teamId: string | null;
};

type ResourceScopeFieldsProps = {
  scope: string;
  teamId: string | null;
  teams: TeamRecord[];
  isAdmin: boolean;
  onChange: (value: ResourceScopeValue) => void;
};

const ResourceScopeFields: React.FC<ResourceScopeFieldsProps> = ({
  scope,
  teamId,
  teams,
  isAdmin,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Form.Item label={t('admin.scope.label', { defaultValue: '可见范围' })}>
        <Select
          value={scope}
          onChange={(value) => {
            const nextScope = String(value);
            onChange({
              scope: nextScope,
              teamId: nextScope === 'team' ? teamId : null,
            });
          }}
        >
          <Select.Option value='personal'>
            {t('admin.scope.personal', { defaultValue: '个人' })}
          </Select.Option>
          <Select.Option value='team'>
            {t('admin.scope.team', { defaultValue: '团队共享' })}
          </Select.Option>
          {isAdmin ? (
            <Select.Option value='organization'>
              {t('admin.scope.organization', { defaultValue: '组织共享' })}
            </Select.Option>
          ) : null}
        </Select>
      </Form.Item>
      {scope === 'team' ? (
        <Form.Item label={t('admin.scope.teamSelect', { defaultValue: '所属团队' })} required>
          <Select
            value={teamId ?? undefined}
            placeholder={t('admin.scope.teamPlaceholder', { defaultValue: '选择团队' })}
            onChange={(value) => onChange({ scope, teamId: String(value) })}
          >
            {teams.map((team) => (
              <Select.Option key={team.id} value={team.id}>
                {team.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      ) : null}
    </>
  );
};

export default ResourceScopeFields;
