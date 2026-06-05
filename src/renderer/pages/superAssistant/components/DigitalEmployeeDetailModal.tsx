/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Modal, Spin, Tag, Timeline } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import type { TeamAgent } from '@/common/types/teamTypes';

export type DigitalEmployeeDetailTarget =
  | { scope: 'personal'; agentId: string; ownerUserId: string }
  | { scope: 'team'; teamId: string; tenantId?: string; slotId: string };

type DigitalEmployeeDetailModalProps = {
  visible: boolean;
  target: DigitalEmployeeDetailTarget | null;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
};

type DetailView = {
  name: string;
  description?: string;
  lastRun?: DigitalEmployeeRunRecord;
  runHistory?: DigitalEmployeeRunRecord[];
};

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function runStatusTag(
  status: DigitalEmployeeRunRecord['status'],
  t: ReturnType<typeof import('react-i18next').useTranslation>['t']
): { color: string; label: string } {
  switch (status) {
    case 'running':
      return {
        color: 'arcoblue',
        label: t('common.superAssistant.digitalEmployee.runStatus.running', { defaultValue: '运行中' }),
      };
    case 'success':
      return {
        color: 'green',
        label: t('common.superAssistant.digitalEmployee.runStatus.success', { defaultValue: '已完成' }),
      };
    case 'failed':
      return {
        color: 'orangered',
        label: t('common.superAssistant.digitalEmployee.runStatus.failed', { defaultValue: '失败' }),
      };
    default:
      return { color: 'gray', label: status };
  }
}

function mapPersonalAgent(agent: PersonalAgent): DetailView {
  return {
    name: agent.name,
    description: agent.description,
    lastRun: agent.automationConfig?.lastRun,
    runHistory: agent.automationConfig?.runHistory,
  };
}

function mapTeamAgent(agent: TeamAgent): DetailView {
  return {
    name: agent.agentName,
    lastRun: agent.lastRun,
    runHistory: agent.runHistory,
  };
}

const DigitalEmployeeDetailModal: React.FC<DigitalEmployeeDetailModalProps> = ({
  visible,
  target,
  onClose,
  onOpenConversation,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<DetailView | null>(null);

  const loadDetail = useCallback(async () => {
    if (!target) {
      setView(null);
      return;
    }
    setLoading(true);
    try {
      if (target.scope === 'personal') {
        const record = await ipcBridge.personalAgent.get.invoke({
          id: target.agentId,
          ownerUserId: target.ownerUserId,
        });
        setView(record ? mapPersonalAgent(record) : null);
        return;
      }
      const team = await ipcBridge.team.get.invoke({ id: target.teamId, tenantId: target.tenantId });
      const agent = team?.agents.find((item) => item.slotId === target.slotId);
      setView(agent ? mapTeamAgent(agent) : null);
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    void loadDetail();
  }, [visible, loadDetail]);

  useEffect(() => {
    if (!visible || view?.lastRun?.status !== 'running') {
      return;
    }
    const timer = window.setInterval(() => {
      void loadDetail();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadDetail, view?.lastRun?.status, visible]);

  const history = view?.runHistory ?? [];
  const lastRun = view?.lastRun;

  return (
    <Modal
      visible={visible}
      title={
        view
          ? t('common.superAssistant.digitalEmployee.detailTitle', {
              defaultValue: '{{name}} · 运行详情',
              name: view.name,
            })
          : t('common.superAssistant.digitalEmployee.detailTitleFallback', { defaultValue: '数字员工运行详情' })
      }
      onCancel={onClose}
      footer={null}
      style={{ width: 640 }}
      unmountOnExit
    >
      {loading && !view ? (
        <div className='flex justify-center py-24px'>
          <Spin />
        </div>
      ) : !view ? (
        <Empty description={t('common.superAssistant.agentNotFound', { defaultValue: '未找到该智能体' })} />
      ) : (
        <div className='flex flex-col gap-16px'>
          {view.description ? (
            <div className='text-13px text-t-secondary'>{view.description}</div>
          ) : null}
          {lastRun ? (
            <div className='rounded-8px border border-[var(--color-border-2)] p-12px'>
              <div className='flex flex-wrap items-center gap-8px'>
                <span className='text-13px font-medium'>
                  {t('common.superAssistant.digitalEmployee.lastRun', { defaultValue: '最近一次运行' })}
                </span>
                <Tag color={runStatusTag(lastRun.status, t).color}>{runStatusTag(lastRun.status, t).label}</Tag>
                <span className='text-12px text-t-tertiary'>{formatTimestamp(lastRun.startedAt)}</span>
              </div>
              {lastRun.summary ? (
                <div className='mt-8px whitespace-pre-wrap text-13px text-t-secondary'>{lastRun.summary}</div>
              ) : null}
              {lastRun.error ? (
                <div className='mt-8px text-13px text-danger'>{lastRun.error}</div>
              ) : null}
              <div className='mt-12px'>
                <Button
                  size='small'
                  type='outline'
                  disabled={!lastRun.conversationId}
                  onClick={() => onOpenConversation(lastRun.conversationId)}
                >
                  {t('common.superAssistant.digitalEmployee.openDebugSession', {
                    defaultValue: '打开调试会话',
                  })}
                </Button>
              </div>
            </div>
          ) : (
            <Empty
              description={t('common.superAssistant.digitalEmployee.noRuns', {
                defaultValue: '尚无运行记录，点击「立即执行」开始后台任务',
              })}
            />
          )}
          {history.length > 0 ? (
            <div>
              <div className='mb-8px text-13px font-medium'>
                {t('common.superAssistant.digitalEmployee.runHistory', { defaultValue: '运行历史' })}
              </div>
              <Timeline>
                {history.map((run) => {
                  const meta = runStatusTag(run.status, t);
                  return (
                    <Timeline.Item key={run.runId} label={formatTimestamp(run.startedAt)}>
                      <div className='flex flex-wrap items-center gap-8px'>
                        <Tag color={meta.color} size='small'>
                          {meta.label}
                        </Tag>
                        {run.summary ? (
                          <span className='text-12px text-t-secondary line-clamp-2'>{run.summary}</span>
                        ) : null}
                      </div>
                      <Button
                        className='mt-6px'
                        size='mini'
                        type='text'
                        onClick={() => onOpenConversation(run.conversationId)}
                      >
                        {t('common.superAssistant.digitalEmployee.openSession', { defaultValue: '查看会话' })}
                      </Button>
                    </Timeline.Item>
                  );
                })}
              </Timeline>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
};

export default DigitalEmployeeDetailModal;
