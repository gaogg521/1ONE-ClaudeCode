import React from 'react';
import { Card, Empty, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { SuperAssistantAgentExecutionGroup } from '../hooks/useSuperAssistantData';

type AgentsTabProps = {
  executionGroups: SuperAssistantAgentExecutionGroup[];
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

const AgentsTab: React.FC<AgentsTabProps> = ({ executionGroups }) => {
  const { t } = useTranslation();

  return (
    <div className='space-y-12px'>
      <Card title={t('common.superAssistant.agentsExecutionTitle', { defaultValue: '当前执行编组' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.agentsExecutionDesc', {
            defaultValue: '按团队查看每个 Agent 当前在处理什么、是否阻塞，以及它依赖的工作区 / 技能 / MCP 能力。',
          })}
        </div>
      </Card>
      {executionGroups.length === 0 ? (
        <Empty
          description={t('common.superAssistant.noTeams', {
            defaultValue: '还没有团队',
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
                              subject: agent.currentIssueSubject ?? t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' }),
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
                      <div className='mt-6px text-12px text-t-secondary'>
                        {t('common.superAssistant.agentCapabilitySources', {
                          defaultValue: '依赖能力',
                        })}
                      </div>
                      <div className='mt-6px flex flex-wrap gap-8px'>
                        {agent.dependencyNames.map((dependency) => (
                          <Tag key={`${agent.slotId}-${dependency}`} color='blue'>
                            {dependency}
                          </Tag>
                        ))}
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
