import React from 'react';
import { Button, Card, Empty } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { SuperAssistantBoardColumn, SuperAssistantIssueItem } from '../hooks/useSuperAssistantData';

type AssignableIssueAgent = {
  slotId: string;
  agentName: string;
};

type CurrentIssueActivityFeedback = {
  assignedAgentName: string | null;
  assignedStatus: 'pending' | 'idle' | 'active' | 'completed' | 'failed' | null;
  blockerMessage: string | null;
};

type IssueBoardFeedback = {
  assignedAgentName: string | null;
  assignedStatus: 'pending' | 'idle' | 'active' | 'completed' | 'failed' | null;
  blockerMessage: string | null;
};

type IssuesWorkbenchProps = {
  isAdmin: boolean;
  loading: boolean;
  boardColumns: SuperAssistantBoardColumn[];
  issueBoardFeedbackById: Record<string, IssueBoardFeedback>;
  currentIssue: SuperAssistantIssueItem | null;
  assignableAgents: AssignableIssueAgent[];
  currentAssignmentAgentName: string | null;
  currentIssueActivityFeedback: CurrentIssueActivityFeedback;
  onSelectIssue: (issueId: string) => void;
  onBreakdownIssue: () => void;
  onAssignIssue: (slotId: string, agentName: string) => void;
  onMarkIssueBlocked: () => void;
  onClearIssueBlocked: () => void;
  onUnassignIssue: () => void;
  onMoveIssueToReview: () => void;
  onMarkIssueDone: () => void;
  onOpenAssignedAgent: () => void;
  onOpenKanban: () => void;
  onOpenTeamFlow: () => void;
  onOpenSharedTasks: () => void;
  onOpenSharedSessions: () => void;
  onOpenEnterpriseModule: () => void;
  onOpenSkills: () => void;
  onOpenMcp: () => void;
};

const IssuesWorkbench: React.FC<IssuesWorkbenchProps> = ({
  isAdmin,
  loading,
  boardColumns,
  issueBoardFeedbackById,
  currentIssue,
  assignableAgents,
  currentAssignmentAgentName,
  currentIssueActivityFeedback,
  onSelectIssue,
  onBreakdownIssue,
  onAssignIssue,
  onMarkIssueBlocked,
  onClearIssueBlocked,
  onUnassignIssue,
  onMoveIssueToReview,
  onMarkIssueDone,
  onOpenAssignedAgent,
  onOpenKanban,
  onOpenTeamFlow,
  onOpenSharedTasks,
  onOpenSharedSessions,
  onOpenEnterpriseModule,
  onOpenSkills,
  onOpenMcp,
}) => {
  const { t } = useTranslation();
  const activityStatusLabel =
    currentIssueActivityFeedback.assignedStatus === 'failed'
      ? t('common.superAssistant.agentStatus.failed', { defaultValue: '已阻塞' })
      : currentIssueActivityFeedback.assignedStatus === 'active'
        ? t('common.superAssistant.agentStatus.active', { defaultValue: '执行中' })
        : currentIssueActivityFeedback.assignedStatus === 'completed'
          ? t('common.superAssistant.agentStatus.completed', { defaultValue: '已完成' })
          : currentIssueActivityFeedback.assignedStatus === 'pending'
            ? t('common.superAssistant.agentStatus.pending', { defaultValue: '准备中' })
            : currentIssueActivityFeedback.assignedStatus === 'idle'
              ? t('common.superAssistant.agentStatus.idle', { defaultValue: '待领取' })
              : null;
  const currentIssueStageLabel = currentIssue
    ? currentIssue.status === 'completed'
      ? t('common.superAssistant.issueStage.done', { defaultValue: '已完成' })
      : currentIssue.status === 'testing'
        ? t('common.superAssistant.issueStage.review', { defaultValue: '待评审' })
        : currentIssue.status === 'developing'
          ? t('common.superAssistant.issueStage.active', { defaultValue: '进行中' })
          : t('common.superAssistant.issueStage.unassigned', { defaultValue: '待分配' })
    : null;
  const boardColumnMeta = [
    {
      key: 'unassigned',
      title: t('common.superAssistant.issueColumns.unassigned', { defaultValue: '待分配' }),
      summary: t('common.superAssistant.issueColumns.unassignedDesc', { defaultValue: '等待超级助手分派' }),
    },
    {
      key: 'active',
      title: t('common.superAssistant.issueColumns.active', { defaultValue: '进行中' }),
      summary: t('common.superAssistant.issueColumns.activeDesc', { defaultValue: '超级助手 / 开发 Agent' }),
    },
    {
      key: 'review',
      title: t('common.superAssistant.issueColumns.review', { defaultValue: '待评审' }),
      summary: t('common.superAssistant.issueColumns.reviewDesc', { defaultValue: '等待测试或人工确认' }),
    },
    {
      key: 'done',
      title: t('common.superAssistant.issueColumns.done', { defaultValue: '已完成' }),
      summary: t('common.superAssistant.issueColumns.doneDesc', { defaultValue: '本周已交付摘要' }),
    },
  ];

  return (
    <div className='grid gap-12px xl:grid-cols-[2.1fr_1.4fr_1.2fr]'>
      <Card
        title={t('common.superAssistant.issuesBoardTitle', { defaultValue: '共享 Issue 看板' })}
        extra={
          <Button size='mini' type='text' onClick={onOpenKanban}>
            {t('common.superAssistant.openFullKanban', { defaultValue: '打开完整看板' })}
          </Button>
        }
      >
        <div className='grid grid-cols-2 gap-8px text-12px xl:grid-cols-4'>
          {boardColumnMeta.map((columnMeta) => {
            const liveColumn = boardColumns.find((item) => item.key === columnMeta.key);
            return (
            <div
              key={columnMeta.key}
              className='rounded-10px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-10px'
            >
              <div className='font-500 text-t-primary'>{columnMeta.title}</div>
              <div className='mt-6px text-t-secondary'>
                {t('common.superAssistant.issueCount', {
                  defaultValue: '{{count}} 个 Issue',
                  count: liveColumn?.count ?? 0,
                })}
              </div>
              <div className='mt-4px grid gap-6px'>
                {liveColumn?.items.length ? (
                  liveColumn.items.slice(0, 3).map((issue) => (
                    <React.Fragment key={issue.id}>
                      <Button
                        size='mini'
                        type={currentIssue?.id === issue.id ? 'primary' : 'secondary'}
                        onClick={() => onSelectIssue(issue.id)}
                      >
                        {issue.subject}
                      </Button>
                      {issueBoardFeedbackById[issue.id]?.assignedAgentName ? (
                        <div className='text-t-tertiary'>
                          {t('common.superAssistant.issueBoard.assignedAgent', {
                            defaultValue: '分配：{{agentName}}',
                            agentName: issueBoardFeedbackById[issue.id].assignedAgentName,
                          })}
                        </div>
                      ) : null}
                      {issueBoardFeedbackById[issue.id]?.assignedStatus ? (
                        <div className='text-t-tertiary'>
                          {t('common.superAssistant.issueBoard.statusLabel', {
                            defaultValue: '状态：{{status}}',
                            status:
                              issueBoardFeedbackById[issue.id].assignedStatus === 'failed'
                                ? t('common.superAssistant.agentStatus.failed', { defaultValue: '已阻塞' })
                                : issueBoardFeedbackById[issue.id].assignedStatus === 'active'
                                  ? t('common.superAssistant.agentStatus.active', { defaultValue: '执行中' })
                                  : issueBoardFeedbackById[issue.id].assignedStatus === 'completed'
                                    ? t('common.superAssistant.agentStatus.completed', { defaultValue: '已完成' })
                                    : issueBoardFeedbackById[issue.id].assignedStatus === 'pending'
                                      ? t('common.superAssistant.agentStatus.pending', { defaultValue: '准备中' })
                                      : t('common.superAssistant.agentStatus.idle', { defaultValue: '待领取' }),
                          })}
                        </div>
                      ) : null}
                      {issueBoardFeedbackById[issue.id]?.blockerMessage ? (
                        <div className='text-t-tertiary'>
                          {t('common.superAssistant.issueBoard.blockerLabel', {
                            defaultValue: '阻塞：{{message}}',
                            message: issueBoardFeedbackById[issue.id].blockerMessage,
                          })}
                        </div>
                      ) : null}
                    </React.Fragment>
                  ))
                ) : (
                  <div className='text-t-tertiary'>{columnMeta.summary}</div>
                )}
              </div>
            </div>
            );
          })}
        </div>
        <div className='mt-10px text-12px text-t-tertiary'>
          {isAdmin
            ? t('common.superAssistant.adminIssuesHint', {
                defaultValue: '管理员视角默认覆盖全队共享 Issue。',
              })
            : t('common.superAssistant.memberIssuesHint', {
                defaultValue: '成员视角默认聚焦与我相关的协作 Issue。',
              })}
        </div>
      </Card>

      <Card title={t('common.superAssistant.activityTitle', { defaultValue: '当前 Issue 活动流' })}>
        {loading ? (
          <div className='text-12px text-t-tertiary'>{t('common.loading', { defaultValue: '请稍候...' })}</div>
        ) : currentIssue ? (
          <div className='space-y-8px text-12px text-t-secondary'>
            <div className='font-600 text-t-primary'>
              {t('common.superAssistant.currentIssueLabel', {
                defaultValue: '当前处理：{{subject}}',
                subject: currentIssue.subject,
              })}
            </div>
            <div>
              {currentIssue.description ||
                t('common.superAssistant.activity.summary', {
                  defaultValue: '最新评论和阻塞会优先汇总在这里。',
                })}
            </div>
            {currentIssueStageLabel ? (
              <div>
                {t('common.superAssistant.activity.currentStage', {
                  defaultValue: '当前阶段：{{stage}}',
                  stage: currentIssueStageLabel,
                })}
              </div>
            ) : null}
            {currentIssueActivityFeedback.assignedAgentName ? (
              <div>
                {t('common.superAssistant.activity.assignedAgent', {
                  defaultValue: '已分配给：{{agentName}}',
                  agentName: currentIssueActivityFeedback.assignedAgentName,
                })}
              </div>
            ) : (
              <div>
                {t('common.superAssistant.activity.unassigned', {
                  defaultValue: '尚未分配到具体 Agent',
                })}
              </div>
            )}
            {activityStatusLabel ? (
              <div>
                {t('common.superAssistant.activity.latestStatus', {
                  defaultValue: '最近状态：{{status}}',
                  status: activityStatusLabel,
                })}
              </div>
            ) : null}
            {currentIssueActivityFeedback.blockerMessage ? (
              <div>
                {t('common.superAssistant.activity.blocker', {
                  defaultValue: '阻塞原因：{{message}}',
                  message: currentIssueActivityFeedback.blockerMessage,
                })}
              </div>
            ) : null}
            <div>{t('common.superAssistant.activity.breakdown', { defaultValue: '超级助手拆解了 3 个子任务并建议分派。' })}</div>
            <div>{t('common.superAssistant.activity.execution', { defaultValue: '开发 Agent 正在推进编码，测试 Agent 等待联调。' })}</div>
          </div>
        ) : (
          <Empty
            description={t('common.superAssistant.noIssues', {
              defaultValue: '暂无共享 Issue',
            })}
          />
        )}
      </Card>

      <Card title={t('common.superAssistant.commandPanelTitle', { defaultValue: '超级助手指挥面板' })}>
        {currentIssue ? (
          <div className='mb-10px text-12px text-t-tertiary'>
            {t('common.superAssistant.currentIssueLabel', {
              defaultValue: '当前处理：{{subject}}',
              subject: currentIssue.subject,
            })}
          </div>
        ) : null}
        <div className='mb-8px text-12px font-600 text-t-secondary'>
          {t('common.superAssistant.taskActionsTitle', { defaultValue: '任务动作' })}
        </div>
        <div className='grid gap-8px'>
          <Button size='small' onClick={onBreakdownIssue}>
            {t('common.superAssistant.breakdownIssue', { defaultValue: '拆解当前 Issue' })}
          </Button>
          <Button size='small' onClick={onOpenTeamFlow}>
            {t('common.superAssistant.launchTeamFlow', { defaultValue: '拉起 Team 协作' })}
          </Button>
          <Button size='small' onClick={onOpenSharedTasks}>
            {t('common.superAssistant.createSharedTask', { defaultValue: '创建共享任务' })}
          </Button>
          <Button size='small' onClick={onOpenSharedSessions}>
            {t('common.superAssistant.createSharedSession', { defaultValue: '创建共享会话' })}
          </Button>
        </div>

        <div className='mb-8px mt-12px text-12px font-600 text-t-secondary'>
          {t('common.superAssistant.assignmentActionsTitle', { defaultValue: '分配动作' })}
        </div>
        {currentAssignmentAgentName ? (
          <div className='mb-8px text-12px text-t-tertiary'>
            {t('common.superAssistant.currentAssignedAgent', {
              defaultValue: '当前已分配：{{agentName}}',
              agentName: currentAssignmentAgentName,
            })}
          </div>
        ) : null}
        <div className='grid gap-8px'>
          {assignableAgents.map((agent) => (
            <Button key={agent.slotId} size='small' onClick={() => onAssignIssue(agent.slotId, agent.agentName)}>
              {t('common.superAssistant.assignIssueToAgent', {
                defaultValue: '分配给 {{agentName}}',
                agentName: agent.agentName,
              })}
            </Button>
          ))}
          {currentAssignmentAgentName ? (
            <Button size='small' onClick={onOpenAssignedAgent}>
              {t('common.superAssistant.openAssignedAgent', {
                defaultValue: '打开已分配 Agent 会话',
              })}
            </Button>
          ) : null}
          {currentIssueActivityFeedback.assignedStatus === 'failed' ||
          currentIssueActivityFeedback.blockerMessage ? (
            <Button size='small' onClick={onClearIssueBlocked}>
              {t('common.superAssistant.clearIssueBlocked', {
                defaultValue: '解除阻塞',
              })}
            </Button>
          ) : null}
          {currentAssignmentAgentName ? (
            <Button size='small' onClick={onMarkIssueBlocked}>
              {t('common.superAssistant.markIssueBlocked', {
                defaultValue: '标记为阻塞',
              })}
            </Button>
          ) : null}
          {currentAssignmentAgentName ? (
            <Button size='small' onClick={onUnassignIssue}>
              {t('common.superAssistant.unassignIssue', {
                defaultValue: '撤销分配',
              })}
            </Button>
          ) : null}
        </div>

        <div className='mb-8px mt-12px text-12px font-600 text-t-secondary'>
          {t('common.superAssistant.stageActionsTitle', { defaultValue: '状态动作' })}
        </div>
        <div className='grid gap-8px'>
          {currentIssue?.status !== 'testing' ? (
            <Button size='small' onClick={onMoveIssueToReview}>
              {t('common.superAssistant.moveIssueToReview', {
                defaultValue: '切到待评审',
              })}
            </Button>
          ) : null}
          {currentIssue?.status !== 'completed' ? (
            <Button size='small' onClick={onMarkIssueDone}>
              {t('common.superAssistant.markIssueDone', {
                defaultValue: '标记已完成',
              })}
            </Button>
          ) : null}
        </div>

        <div className='mb-8px mt-12px text-12px font-600 text-t-secondary'>
          {t('common.superAssistant.moduleActionsTitle', { defaultValue: '模块动作' })}
        </div>
        <div className='grid gap-8px'>
          <Button size='small' onClick={onOpenEnterpriseModule}>
            {t('common.superAssistant.openEnterpriseModule', { defaultValue: '调用企业模块' })}
          </Button>
          <Button size='small' onClick={onOpenSkills}>
            {t('common.superAssistant.openSkills', { defaultValue: '打开 Skills 能力包' })}
          </Button>
          <Button size='small' onClick={onOpenMcp}>
            {t('common.superAssistant.openMcp', { defaultValue: '触发 MCP / 自动化' })}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default IssuesWorkbench;
