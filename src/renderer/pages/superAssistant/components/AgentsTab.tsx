import React, { useMemo } from 'react';
import { Button, Card, Empty, Popconfirm, Tag } from '@arco-design/web-react';
import { Delete, Edit, FileText, PlayOne, Plus, Time, Magic } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { useAllCronJobs } from '@/renderer/pages/cron/useCronJobs';
import type { SuperAssistantAgentExecutionGroup } from '../hooks/useSuperAssistantData';
import { listAgentCronJobs } from '../utils/agentAutomationUtils';
import { useAgentTemplates, getTemplateName, getTemplateDescription } from '../templates/agentTemplates';

export type AgentCardRef = {
  teamId: string;
  teamName: string;
  slotId: string;
  agentName: string;
  agentType: string;
};

type AgentsTabProps = {
  executionGroups: SuperAssistantAgentExecutionGroup[];
  onCreateAgent?: () => void;
  onManageAgent?: (agent: AgentCardRef) => void;
  onRunAgentNow?: (agent: AgentCardRef) => void;
  onScheduleAgent?: (agent: AgentCardRef) => void;
  onViewDigitalEmployeeDetail?: (agent: AgentCardRef) => void;
  onDeleteAgent?: (agent: AgentCardRef) => Promise<void>;
  /** Create a personal agent from a template (template id). */
  onCreateFromTemplate?: (templateId: string) => Promise<void>;
  /** Whether a template creation is in flight (disables the card to prevent double-click). */
  creatingFromTemplate?: boolean;
};

function getStatusMeta(
  status: 'pending' | 'idle' | 'active' | 'completed' | 'failed',
  t: ReturnType<typeof useTranslation>['t']
): { color: 'green' | 'blue' | 'orangered' | 'gold' | 'arcoblue'; label: string } {
  switch (status) {
    case 'active':
      return { color: 'green', label: t('common.superAssistant.agentStatus.active', { defaultValue: '执行中' }) };
    case 'failed':
      return { color: 'orangered', label: t('common.superAssistant.agentStatus.failed', { defaultValue: '已阻塞' }) };
    case 'completed':
      return {
        color: 'arcoblue',
        label: t('common.superAssistant.agentStatus.completed', { defaultValue: '已完成' }),
      };
    case 'pending':
      return { color: 'gold', label: t('common.superAssistant.agentStatus.pending', { defaultValue: '准备中' }) };
    case 'idle':
    default:
      return { color: 'blue', label: t('common.superAssistant.agentStatus.idle', { defaultValue: '待领取' }) };
  }
}

const AgentsTab: React.FC<AgentsTabProps> = ({
  executionGroups,
  onCreateAgent,
  onManageAgent,
  onRunAgentNow,
  onScheduleAgent,
  onViewDigitalEmployeeDetail,
  onDeleteAgent,
  onCreateFromTemplate,
  creatingFromTemplate,
}) => {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const { jobs } = useAllCronJobs();
  const templates = useAgentTemplates();
  const language = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  const automationCountByAgent = useMemo(() => {
    const map = new Map<string, number>();
    executionGroups.forEach((group) => {
      group.agents.forEach((agent) => {
        const key = `${group.teamId}:${agent.slotId}`;
        map.set(key, listAgentCronJobs(jobs, group.teamId, agent.slotId).length);
      });
    });
    return map;
  }, [executionGroups, jobs]);

  const toAgentRef = (group: SuperAssistantAgentExecutionGroup, agent: (typeof group.agents)[number]): AgentCardRef => ({
    teamId: group.teamId,
    teamName: group.teamName,
    slotId: agent.slotId,
    agentName: agent.agentName,
    agentType: agent.agentType,
  });

  return (
    <div className='space-y-12px'>
      <Card title={t('common.superAssistant.agentsExecutionTitle', { defaultValue: '数字员工' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.agentsExecutionDesc', {
            defaultValue:
              '在每个数字员工卡片上可直接编辑、立即执行或配置定时任务，实现 7×24 持续跟进 Issues。',
          })}
        </div>
        <div className='mt-12px'>
          <Button type='primary' size='small' icon={<Plus theme='outline' size='14' />} onClick={() => onCreateAgent?.()}>
            {t('common.superAssistant.createDigitalEmployeeTitle', { defaultValue: '创建数字员工' })}
          </Button>
        </div>
      </Card>
      {templates.length > 0 && onCreateFromTemplate ? (
        <Card
          title={
            <span className='flex items-center gap-6px'>
              <Magic theme='outline' size={16} />
              {t('common.superAssistant.agentTemplatesTitle', { defaultValue: '快速模板' })}
            </span>
          }
        >
          <div className='text-12px text-t-tertiary mb-12px'>
            {t('common.superAssistant.agentTemplatesDesc', {
              defaultValue: '一键创建预配置的智能体，开箱即用。',
            })}
          </div>
          <div className='grid gap-12px md:grid-cols-2'>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                size='small'
                hoverable
                className='cursor-pointer'
                onClick={() => {
                  if (creatingFromTemplate) return;
                  void onCreateFromTemplate(tpl.id);
                }}
              >
                <div className='flex items-start gap-10px'>
                  <span className='text-24px leading-1'>{tpl.avatar}</span>
                  <div className='flex-1 min-w-0'>
                    <div className='font-600 text-t-primary text-14px'>
                      {getTemplateName(tpl, language)}
                    </div>
                    <div className='text-12px text-t-secondary mt-4px'>
                      {getTemplateDescription(tpl, language)}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      ) : null}
      {executionGroups.length === 0 ? (
        <Empty
          description={t('common.superAssistant.noDigitalEmployees', {
            defaultValue: '还没有数字员工。个人版可直接创建；加入协同团队后可创建工作区数字员工。',
          })}
        />
      ) : (
        <div className='space-y-12px'>
          {executionGroups.map((group) => (
            <Card
              key={group.teamId}
              title={group.teamName}
              extra={
                <Tag color={group.activeAgentCount > 0 ? 'green' : 'blue'}>
                  {t('common.superAssistant.agentCount', {
                    defaultValue: '{{count}} 个协作 Agent',
                    count: group.agentCount,
                  })}
                </Tag>
              }
            >
              <div className='mb-10px text-12px text-t-secondary'>
                {t('common.superAssistant.teamConversationCount', {
                  defaultValue: '{{count}} 个团队会话',
                  count: group.conversationCount,
                })}
              </div>
              <div className='grid gap-12px md:grid-cols-2'>
                {group.agents.map((agent) => {
                  const statusMeta = getStatusMeta(agent.status, t);
                  const agentRef = toAgentRef(group, agent);
                  const automationCount = automationCountByAgent.get(`${group.teamId}:${agent.slotId}`) ?? 0;
                  const runMeta = agent.digitalEmployeeRun;
                  const runStatusLabel =
                    runMeta?.status === 'running'
                      ? t('common.superAssistant.digitalEmployee.runStatus.running', { defaultValue: '运行中' })
                      : runMeta?.status === 'success'
                        ? t('common.superAssistant.digitalEmployee.runStatus.success', { defaultValue: '已完成' })
                        : runMeta?.status === 'failed'
                          ? t('common.superAssistant.digitalEmployee.runStatus.failed', { defaultValue: '失败' })
                          : null;
                  const focusText =
                    agent.status === 'failed'
                      ? agent.blockerMessage
                        ? t('common.superAssistant.agentBlocker', {
                            defaultValue: '阻塞原因：{{message}}',
                            message: agent.blockerMessage,
                          })
                        : t('common.superAssistant.agentBlockedFallback', {
                            defaultValue: '当前执行已阻塞，等待人工处理',
                          })
                      : agent.currentIssueSubject
                        ? t('common.superAssistant.agentCurrentIssue', {
                            defaultValue: '当前处理：{{subject}}',
                            subject: agent.currentIssueSubject,
                          })
                        : agent.status === 'completed'
                          ? t('common.superAssistant.agentCompletedIssue', {
                              defaultValue: '刚完成：{{subject}}',
                              subject:
                                agent.currentIssueSubject ??
                                t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' }),
                            })
                          : agent.queuedIssueSubject
                            ? t('common.superAssistant.agentQueuedIssue', {
                                defaultValue: '待领取：{{subject}}',
                                subject: agent.queuedIssueSubject,
                              })
                            : t('common.superAssistant.agentIdleFallback', {
                                defaultValue: '等待下一轮任务',
                              });

                  return (
                    <Card
                      key={agent.slotId}
                      title={agent.agentName}
                      extra={<Tag color={statusMeta.color}>{statusMeta.label}</Tag>}
                    >
                      <div className='text-12px text-t-tertiary'>{focusText}</div>
                      {runMeta ? (
                        <div className='mt-8px text-12px text-t-secondary'>
                          {runStatusLabel
                            ? t('common.superAssistant.digitalEmployee.cardLastRun', {
                                defaultValue: '上次运行：{{status}} · {{time}}',
                                status: runStatusLabel,
                                time: new Date(runMeta.startedAt).toLocaleString(),
                              })
                            : null}
                          {runMeta.summary ? (
                            <div className='mt-4px line-clamp-2 text-t-tertiary'>{runMeta.summary}</div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className='mt-8px flex flex-wrap gap-6px'>
                        {automationCount > 0 ? (
                          <Tag color='purple' size='small'>
                            {t('common.superAssistant.agentAutomationCount', {
                              defaultValue: '{{count}} 个自动化',
                              count: automationCount,
                            })}
                          </Tag>
                        ) : (
                          <Tag color='gray' size='small'>
                            {t('common.superAssistant.agentAutomationNone', { defaultValue: '未配置自动化' })}
                          </Tag>
                        )}
                      </div>
                      <div className='mt-6px text-12px text-t-secondary'>
                        {t('common.superAssistant.agentCapabilitySources', { defaultValue: '依赖能力' })}
                      </div>
                      <div className='mt-6px flex flex-wrap gap-8px'>
                        {agent.dependencyNames.map((dependency) => (
                          <Tag key={`${agent.slotId}-${dependency}`} color='blue' size='small'>
                            {dependency}
                          </Tag>
                        ))}
                      </div>
                      <div className='mt-12px flex flex-wrap gap-8px'>
                        <Button size='mini' icon={<Edit theme='outline' size='14' />} onClick={() => onManageAgent?.(agentRef)}>
                          {t('common.superAssistant.agentEdit', { defaultValue: '编辑' })}
                        </Button>
                        <Button
                          size='mini'
                          type='primary'
                          icon={<PlayOne theme='outline' size='14' />}
                          onClick={() => onRunAgentNow?.(agentRef)}
                        >
                          {t('common.superAssistant.agentRunNow', { defaultValue: '立即执行' })}
                        </Button>
                        <Button
                          size='mini'
                          type='outline'
                          icon={<Time theme='outline' size='14' />}
                          onClick={() => onScheduleAgent?.(agentRef)}
                        >
                          {t('common.superAssistant.agentSchedule', { defaultValue: '定时自动化' })}
                        </Button>
                        {onViewDigitalEmployeeDetail ? (
                          <Button
                            size='mini'
                            type='outline'
                            icon={<FileText theme='outline' size='14' />}
                            onClick={() => onViewDigitalEmployeeDetail(agentRef)}
                          >
                            {t('common.superAssistant.digitalEmployee.viewDetail', {
                              defaultValue: '查看详情',
                            })}
                          </Button>
                        ) : null}
                        {onDeleteAgent ? (
                          <Popconfirm
                            title={t('common.superAssistant.deleteAgentConfirmTitle', {
                              defaultValue: '删除数字员工？',
                            })}
                            content={t('common.superAssistant.deleteAgentConfirmDesc', {
                              defaultValue:
                                '将删除「{{agent}}」及其关联的定时任务，且不可恢复。',
                              agent: agent.agentName,
                            })}
                            okButtonProps={{ status: 'danger' }}
                            onOk={() => onDeleteAgent(agentRef)}
                          >
                            <Button size='mini' status='danger' icon={<Delete theme='outline' size='14' />}>
                              {t('common.delete', { defaultValue: '删除' })}
                            </Button>
                          </Popconfirm>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentsTab;
