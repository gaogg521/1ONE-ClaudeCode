import React, { useState } from 'react';
import { Badge, Button, Card, Empty, Modal, Tag, Tooltip } from '@arco-design/web-react';
import { Robot, Timer, User } from '@icon-park/react';
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

function getStatusTag(
  status: IssueBoardFeedback['assignedStatus'],
  t: ReturnType<typeof useTranslation>['t']
) {
  if (!status) return null;
  const map: Record<string, { color: string; label: string }> = {
    active: { color: 'green', label: t('common.superAssistant.agentStatus.active', { defaultValue: '执行中' }) },
    failed: { color: 'orangered', label: t('common.superAssistant.agentStatus.failed', { defaultValue: '已阻塞' }) },
    completed: { color: 'arcoblue', label: t('common.superAssistant.agentStatus.completed', { defaultValue: '已完成' }) },
    pending: { color: 'gold', label: t('common.superAssistant.agentStatus.pending', { defaultValue: '准备中' }) },
    idle: { color: 'gray', label: t('common.superAssistant.agentStatus.idle', { defaultValue: '待领取' }) },
  };
  const meta = map[status] ?? map.idle;
  return <Tag size='small' color={meta.color}>{meta.label}</Tag>;
}

const IssuesWorkbench: React.FC<IssuesWorkbenchProps> = ({
  isAdmin: _isAdmin,
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
  const [autopilotVisible, setAutopilotVisible] = useState(false);

  // 所有 issues
  const allIssues = boardColumns.flatMap((col) => col.items);

  // 按 Agent 分组：未分配 + 每个 Agent 一列
  const unassignedIssues = allIssues.filter(
    (issue) => !issueBoardFeedbackById[issue.id]?.assignedAgentName
  );

  const agentColumns = assignableAgents.map((agent) => ({
    agent,
    issues: allIssues.filter(
      (issue) => issueBoardFeedbackById[issue.id]?.assignedAgentName === agent.agentName
    ),
  }));

  const renderIssueCard = (issue: SuperAssistantIssueItem) => {
    const feedback = issueBoardFeedbackById[issue.id];
    const isSelected = currentIssue?.id === issue.id;
    return (
      <div
        key={issue.id}
        className={[
          'p-10px rd-8px border border-solid cursor-pointer transition-all',
          isSelected
            ? 'border-primary bg-primary-light-1'
            : 'border-[var(--color-border-2)] bg-[var(--color-fill-1)] hover:border-primary hover:bg-[var(--color-fill-2)]',
        ].join(' ')}
        onClick={() => onSelectIssue(issue.id)}
      >
        <div className='text-13px font-600 text-t-primary truncate'>{issue.subject}</div>
        {issue.description && (
          <div className='mt-4px text-11px text-t-tertiary truncate'>{issue.description}</div>
        )}
        <div className='mt-6px flex items-center gap-6px flex-wrap'>
          {issue.priority && (
            <Tag size='small' color={issue.priority === 'high' ? 'red' : issue.priority === 'medium' ? 'orange' : 'gray'}>
              {issue.priority}
            </Tag>
          )}
          {feedback?.assignedStatus && getStatusTag(feedback.assignedStatus, t)}
          {feedback?.blockerMessage && (
            <Tooltip content={feedback.blockerMessage}>
              <Tag size='small' color='orangered'>阻塞</Tag>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className='flex flex-col gap-12px'>
      {/* Agent-as-column 看板 — 参考 Multica board view */}
      <Card
        title={
          <div className='flex items-center gap-10px'>
            <span>{t('common.superAssistant.issuesBoardTitle', { defaultValue: '共享 Issue 看板' })}</span>
            <Tag size='small' color='arcoblue'>{allIssues.length} Issues</Tag>
          </div>
        }
        extra={
          <div className='flex gap-8px'>
            <Button size='mini' type='text' icon={<Timer />} onClick={() => setAutopilotVisible(true)}>
              {t('common.superAssistant.autopilots', { defaultValue: 'Autopilots' })}
            </Button>
            <Button size='mini' type='text' onClick={onOpenKanban}>
              {t('common.superAssistant.openFullKanban', { defaultValue: '完整看板' })}
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className='text-12px text-t-tertiary py-20px text-center'>{t('common.loading', { defaultValue: '请稍候...' })}</div>
        ) : allIssues.length === 0 ? (
          <Empty description={t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' })} />
        ) : (
          <div className='flex gap-12px overflow-x-auto pb-4px'>
            {/* 未分配列 */}
            <div className='min-w-200px flex-shrink-0'>
              <div className='flex items-center gap-6px mb-8px px-4px'>
                <User size={14} className='text-t-tertiary' />
                <span className='text-12px font-600 text-t-secondary'>
                  {t('common.superAssistant.unassigned', { defaultValue: '未分配' })}
                </span>
                <Badge count={unassignedIssues.length} className='ml-auto' />
              </div>
              <div className='flex flex-col gap-6px'>
                {unassignedIssues.length === 0 ? (
                  <div className='text-11px text-t-tertiary text-center py-12px'>
                    {t('common.superAssistant.allAssigned', { defaultValue: '全部已分配' })}
                  </div>
                ) : (
                  unassignedIssues.map(renderIssueCard)
                )}
              </div>
            </div>

            {/* 每个 Agent 一列 */}
            {agentColumns.map(({ agent, issues }) => (
              <div key={agent.slotId} className='min-w-200px flex-shrink-0'>
                <div className='flex items-center gap-6px mb-8px px-4px'>
                  <Robot size={14} className='text-primary' />
                  <span className='text-12px font-600 text-t-primary truncate max-w-120px'>{agent.agentName}</span>
                  <Badge
                    count={issues.filter((i) => issueBoardFeedbackById[i.id]?.assignedStatus === 'active').length}
                    className='ml-auto'
                    style={{ backgroundColor: '#00b42a' }}
                  />
                </div>
                <div className='flex flex-col gap-6px'>
                  {issues.length === 0 ? (
                    <div className='text-11px text-t-tertiary text-center py-12px border border-dashed border-[var(--color-border-2)] rd-8px'>
                      {t('common.superAssistant.agentIdle', { defaultValue: '空闲，可接收 Issue' })}
                    </div>
                  ) : (
                    issues.map(renderIssueCard)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 当前 Issue 操作面板 */}
      {currentIssue && (
        <div className='grid gap-12px md:grid-cols-2'>
          {/* 活动流 */}
          <Card title={t('common.superAssistant.activityTitle', { defaultValue: '当前 Issue 活动流' })}>
            <div className='space-y-8px text-12px text-t-secondary'>
              <div className='font-600 text-t-primary text-14px'>{currentIssue.subject}</div>
              {currentIssue.description && <div className='text-t-secondary'>{currentIssue.description}</div>}
              <div className='flex items-center gap-8px flex-wrap'>
                {currentIssueActivityFeedback.assignedAgentName ? (
                  <Tag color='arcoblue' size='small'>
                    {t('common.superAssistant.activity.assignedAgent', {
                      defaultValue: '分配给：{{agentName}}',
                      agentName: currentIssueActivityFeedback.assignedAgentName,
                    })}
                  </Tag>
                ) : (
                  <Tag color='gray' size='small'>{t('common.superAssistant.activity.unassigned', { defaultValue: '未分配' })}</Tag>
                )}
                {getStatusTag(currentIssueActivityFeedback.assignedStatus, t)}
              </div>
              {currentIssueActivityFeedback.blockerMessage && (
                <div className='p-8px bg-danger-light-1 rd-6px text-danger text-11px'>
                  {t('common.superAssistant.activity.blocker', {
                    defaultValue: '阻塞：{{message}}',
                    message: currentIssueActivityFeedback.blockerMessage,
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* 指挥面板 */}
          <Card title={t('common.superAssistant.commandPanelTitle', { defaultValue: '指挥面板' })}>
            <div className='flex flex-col gap-16px'>
              {/* 分配给 Agent */}
              <div>
                <div className='text-11px font-600 text-t-tertiary mb-6px uppercase tracking-wide'>
                  {t('common.superAssistant.assignmentActionsTitle', { defaultValue: '分配给 Agent' })}
                </div>
                <div className='flex flex-wrap gap-6px'>
                  {assignableAgents.map((agent) => (
                    <Button
                      key={agent.slotId}
                      size='small'
                      type={currentAssignmentAgentName === agent.agentName ? 'primary' : 'outline'}
                      icon={<Robot size={12} />}
                      onClick={() => onAssignIssue(agent.slotId, agent.agentName)}
                    >
                      {agent.agentName}
                    </Button>
                  ))}
                  {assignableAgents.length === 0 && (
                    <span className='text-11px text-t-tertiary'>{t('common.superAssistant.noAgents', { defaultValue: '团队暂无 Agent' })}</span>
                  )}
                </div>
              </div>

              {/* 状态动作 */}
              <div>
                <div className='text-11px font-600 text-t-tertiary mb-6px uppercase tracking-wide'>
                  {t('common.superAssistant.stageActionsTitle', { defaultValue: '状态' })}
                </div>
                <div className='flex flex-wrap gap-6px'>
                  {currentAssignmentAgentName && (
                    <Button size='small' onClick={onOpenAssignedAgent}>
                      {t('common.superAssistant.openAssignedAgent', { defaultValue: '打开 Agent 会话' })}
                    </Button>
                  )}
                  <Button size='small' onClick={onBreakdownIssue}>
                    {t('common.superAssistant.breakdownIssue', { defaultValue: '拆解 Issue' })}
                  </Button>
                  {currentIssue.status !== 'testing' && (
                    <Button size='small' onClick={onMoveIssueToReview}>
                      {t('common.superAssistant.moveIssueToReview', { defaultValue: '切到待评审' })}
                    </Button>
                  )}
                  {currentIssue.status !== 'completed' && (
                    <Button size='small' type='primary' onClick={onMarkIssueDone}>
                      {t('common.superAssistant.markIssueDone', { defaultValue: '标记完成' })}
                    </Button>
                  )}
                  {(currentIssueActivityFeedback.assignedStatus === 'failed' || currentIssueActivityFeedback.blockerMessage) && (
                    <Button size='small' status='success' onClick={onClearIssueBlocked}>
                      {t('common.superAssistant.clearIssueBlocked', { defaultValue: '解除阻塞' })}
                    </Button>
                  )}
                  {currentAssignmentAgentName && (
                    <Button size='small' status='warning' onClick={onMarkIssueBlocked}>
                      {t('common.superAssistant.markIssueBlocked', { defaultValue: '标记阻塞' })}
                    </Button>
                  )}
                  {currentAssignmentAgentName && (
                    <Button size='small' onClick={onUnassignIssue}>
                      {t('common.superAssistant.unassignIssue', { defaultValue: '撤销分配' })}
                    </Button>
                  )}
                </div>
              </div>

              {/* 快捷入口 */}
              <div>
                <div className='text-11px font-600 text-t-tertiary mb-6px uppercase tracking-wide'>
                  {t('common.superAssistant.moduleActionsTitle', { defaultValue: '快捷入口' })}
                </div>
                <div className='flex flex-wrap gap-6px'>
                  <Button size='small' onClick={onOpenTeamFlow}>{t('common.superAssistant.launchTeamFlow', { defaultValue: 'Team 协作' })}</Button>
                  <Button size='small' onClick={onOpenSharedTasks}>{t('common.superAssistant.createSharedTask', { defaultValue: '共享任务' })}</Button>
                  <Button size='small' onClick={onOpenSharedSessions}>{t('common.superAssistant.createSharedSession', { defaultValue: '共享会话' })}</Button>
                  <Button size='small' onClick={onOpenSkills}>{t('common.superAssistant.openSkills', { defaultValue: 'Skills' })}</Button>
                  <Button size='small' onClick={onOpenMcp}>{t('common.superAssistant.openMcp', { defaultValue: 'MCP' })}</Button>
                  <Button size='small' onClick={onOpenEnterpriseModule}>{t('common.superAssistant.openEnterpriseModule', { defaultValue: '企业模块' })}</Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Autopilots 弹窗 — 定时/自动触发入口 */}
      <Modal
        title={t('common.superAssistant.autopilotsTitle', { defaultValue: 'Autopilots — 定时自动触发' })}
        visible={autopilotVisible}
        onCancel={() => setAutopilotVisible(false)}
        footer={null}
        style={{ width: 520 }}
      >
        <div className='space-y-12px text-13px text-t-secondary'>
          <div className='p-12px bg-fill-2 rd-8px'>
            <div className='font-600 text-t-primary mb-4px'>
              {t('common.superAssistant.autopilotDesc', { defaultValue: '什么是 Autopilots？' })}
            </div>
            <div className='text-12px'>
              {t('common.superAssistant.autopilotDescDetail', {
                defaultValue: '参考 Multica 的 Autopilots 设计：设置长期指令，让 Agent 按计划自动执行——例如每天早上做 standup 总结、每周一扫描未关闭 Issue 并分配。',
              })}
            </div>
          </div>
          <div className='p-12px border border-dashed border-[var(--color-border-2)] rd-8px text-center text-t-tertiary'>
            <Timer size={24} className='mx-auto mb-8px opacity-40' />
            <div className='text-12px'>
              {t('common.superAssistant.autopilotComingSoon', {
                defaultValue: 'Autopilots 功能即将上线。当前可通过「创建共享任务」手动触发 Agent 执行。',
              })}
            </div>
            <Button size='small' type='outline' className='mt-10px' onClick={() => { setAutopilotVisible(false); onOpenSharedTasks(); }}>
              {t('common.superAssistant.createSharedTask', { defaultValue: '创建共享任务' })}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default IssuesWorkbench;
