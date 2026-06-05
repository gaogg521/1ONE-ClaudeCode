/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Input, Spin, Table, Tag } from '@arco-design/web-react';
import type { ButtonProps } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamRuntimeNode } from '@/common/types/teamRuntimeTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { useTeamRuntimeFleet } from '../hooks/useTeamRuntimeFleet';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';

type TeamRuntimeFleetPanelProps = {
  teamIds?: string[];
  enabled?: boolean;
  nodesOverride?: TeamRuntimeNode[];
  loading?: boolean;
  onRefresh?: () => Promise<void> | void;
};

function formatAddressList(values: string[]): string {
  return values.length > 0 ? values.join(' · ') : '—';
}

const TeamRuntimeFleetPanel: React.FC<TeamRuntimeFleetPanelProps> = ({
  teamIds,
  enabled = true,
  nodesOverride,
  loading: loadingOverride,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentUserId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fleet = useTeamRuntimeFleet({
    enabled: enabled && nodesOverride == null,
    teamIds,
    includeOffline: true,
  });
  const nodes = nodesOverride ?? fleet.nodes;
  const loading = loadingOverride ?? fleet.loading;
  const refresh = onRefresh ?? fleet.refresh;

  const filteredNodes = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) {
      return nodes;
    }
    return nodes.filter((node) => {
      const haystack = [
        node.displayName,
        ...node.hostnames,
        ...node.ipAddresses,
        node.userId,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [keyword, nodes]);

  const stats = useMemo(() => {
    const online = nodes.filter((node) => node.status === 'online').length;
    return { total: nodes.length, online, offline: nodes.length - online };
  }, [nodes]);

  const { localNodes, remoteNodes } = useMemo(() => {
    const local: TeamRuntimeNode[] = [];
    const remote: TeamRuntimeNode[] = [];
    for (const node of filteredNodes) {
      if (node.userId === currentUserId) {
        local.push(node);
      } else {
        remote.push(node);
      }
    }
    return { localNodes: local, remoteNodes: remote };
  }, [currentUserId, filteredNodes]);

  const selectedNode = useMemo(() => {
    if (!filteredNodes.length) {
      return null;
    }
    if (selectedId) {
      return filteredNodes.find((node) => node.id === selectedId) ?? filteredNodes[0];
    }
    return filteredNodes[0];
  }, [filteredNodes, selectedId]);

  const renderNodeButton = (node: TeamRuntimeNode) => {
    const active = selectedNode?.id === node.id;
    const nodeButtonProps: ButtonProps = {
      type: 'text',
      long: true,
      className: `!h-auto !justify-start !px-12px !py-10px rd-8px border ${
        active ? 'border-primary-6 bg-primary-1' : 'border-border-2 bg-1 hover:bg-2'
      }`,
      onClick: () => setSelectedId(node.id),
    };
    return (
      <Button key={node.id} {...nodeButtonProps}>
        <div className='flex items-center justify-between gap-8px'>
          <span className='text-13px font-600 text-t-primary truncate'>{node.displayName}</span>
          <Tag color={node.status === 'online' ? 'green' : 'gold'} size='small'>
            {node.status === 'online'
              ? t('common.superAssistant.runtimeFleet.online', { defaultValue: '在线' })
              : t('common.superAssistant.runtimeFleet.offline', { defaultValue: '离线' })}
          </Tag>
        </div>
        <div className='mt-4px text-11px text-t-tertiary truncate'>
          {formatAddressList(node.ipAddresses)}
        </div>
        <div className='mt-6px text-11px text-t-secondary'>
          {t('common.superAssistant.runtimeFleet.agentCount', {
            defaultValue: '{{count}} 个运行时',
            count: node.installedAgents.length,
          })}
        </div>
      </Button>
    );
  };

  return (
    <div className='space-y-12px'>
      <div className='flex flex-wrap items-center justify-between gap-8px'>
        <div className='flex flex-wrap items-center gap-8px'>
          <Badge count={stats.total} text={t('common.superAssistant.runtimeFleet.filterAll', { defaultValue: '全部' })} />
          <Tag color='green'>
            {t('common.superAssistant.runtimeFleet.filterOnline', {
              defaultValue: '在线 {{count}}',
              count: stats.online,
            })}
          </Tag>
          <Tag color='gold'>
            {t('common.superAssistant.runtimeFleet.filterOffline', {
              defaultValue: '离线 {{count}}',
              count: stats.offline,
            })}
          </Tag>
        </div>
        <Button
          size='small'
          icon={<Refresh theme='outline' size='14' />}
          loading={loading}
          onClick={() => void refresh()}
        >
          {t('common.refresh', { defaultValue: '刷新' })}
        </Button>
      </div>
      <Input
        allowClear
        value={keyword}
        onChange={setKeyword}
        placeholder={t('common.superAssistant.runtimeFleet.searchPlaceholder', {
          defaultValue: '搜索机器名或 IP…',
        })}
      />
      {loading && nodes.length === 0 ? (
        <div className='flex justify-center py-24px'>
          <Spin />
        </div>
      ) : filteredNodes.length === 0 ? (
        <Empty
          description={t('common.superAssistant.runtimeFleet.empty', {
            defaultValue:
              '暂无队友机器上报。成员需加入同一组织（邀请码 / 企业登录）并登录组织服务器，本机会自动同步心跳。',
          })}
        />
      ) : (
        <div className='grid gap-12px lg:grid-cols-[280px_1fr]'>
          <Card className='!mb-0' bodyStyle={{ padding: 12 }}>
            <div className='space-y-12px max-h-420px overflow-y-auto'>
              {localNodes.length > 0 ? (
                <div>
                  <div className='mb-8px text-12px font-600 text-t-secondary'>
                    {t('common.superAssistant.runtimeFleet.localSection', { defaultValue: '本机' })}
                  </div>
                  <div className='space-y-8px'>{localNodes.map(renderNodeButton)}</div>
                </div>
              ) : null}
              {remoteNodes.length > 0 ? (
                <div>
                  <div className='mb-8px text-12px font-600 text-t-secondary'>
                    {t('common.superAssistant.runtimeFleet.remoteSection', { defaultValue: '队友' })}
                  </div>
                  <div className='space-y-8px'>{remoteNodes.map(renderNodeButton)}</div>
                </div>
              ) : null}
            </div>
          </Card>
          <Card
            className='!mb-0'
            title={selectedNode?.displayName}
            extra={
              selectedNode ? (
                <Tag color={selectedNode.status === 'online' ? 'green' : 'gold'}>
                  {selectedNode.status === 'online'
                    ? t('common.superAssistant.runtimeFleet.online', { defaultValue: '在线' })
                    : t('common.superAssistant.runtimeFleet.offline', { defaultValue: '离线' })}
                </Tag>
              ) : null
            }
          >
            {selectedNode ? (
              <div className='space-y-12px'>
                <div className='grid gap-8px md:grid-cols-2 text-12px text-t-secondary'>
                  <div>
                    <span className='text-t-tertiary'>
                      {t('common.superAssistant.runtimeFleet.hostname', { defaultValue: '机器名' })}：
                    </span>{' '}
                    {formatAddressList(selectedNode.hostnames)}
                  </div>
                  <div>
                    <span className='text-t-tertiary'>
                      {t('common.superAssistant.runtimeFleet.ip', { defaultValue: 'IP' })}：
                    </span>{' '}
                    {formatAddressList(selectedNode.ipAddresses)}
                  </div>
                  <div>
                    <span className='text-t-tertiary'>
                      {t('common.superAssistant.runtimeFleet.member', { defaultValue: '成员' })}：
                    </span>{' '}
                    {selectedNode.userId}
                  </div>
                  <div>
                    <span className='text-t-tertiary'>
                      {t('common.superAssistant.runtimeFleet.lastSeen', { defaultValue: '最近心跳' })}：
                    </span>{' '}
                    {new Date(selectedNode.lastSeenAt).toLocaleString()}
                  </div>
                </div>
                <Table
                  size='small'
                  pagination={false}
                  rowKey={(record) => record.backend}
                  data={selectedNode.installedAgents}
                  columns={[
                    {
                      title: t('common.superAssistant.runtimeFleet.runtimeColumn', { defaultValue: '运行时' }),
                      dataIndex: 'name',
                      render: (_value, record) => (
                        <div className='flex items-center gap-8px'>
                          <img src={getAgentLogo(record.backend)} alt='' className='w-18px h-18px' />
                          <span>{record.name}</span>
                          <span className='text-11px text-t-tertiary'>({record.backend})</span>
                        </div>
                      ),
                    },
                    {
                      title: t('common.superAssistant.runtimeFleet.pathColumn', { defaultValue: '路径' }),
                      dataIndex: 'cliPath',
                      render: (value: string | undefined) => (
                        <span className='text-11px text-t-tertiary break-all'>{value || '—'}</span>
                      ),
                    },
                  ]}
                />
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
};

export default TeamRuntimeFleetPanel;
