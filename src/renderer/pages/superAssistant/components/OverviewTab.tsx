import React from 'react';
import { Button, Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type OverviewTabProps = {
  isAdmin: boolean;
  tenantLabel?: string | null;
  openIssueCount: number;
  visibleIssueCount: number;
  totalAgentCount: number;
  activeAgentCount: number;
  teamConversationCount: number;
  featuredIssueSubject?: string | null;
  skillCount: number;
  enabledMcpCount: number;
  teamCount: number;
  ragDocumentCount: number;
  ragChunkCount: number;
  codeRepoCount: number;
  pipelineCount: number;
  onBreakdownIssue: () => void;
  onOpenTeamFlow: () => void;
  onOpenSharedTasks: () => void;
  onOpenSharedSessions: () => void;
  onOpenSkills: () => void;
  onOpenMcp: () => void;
  onOpenRuntimes: () => void;
  onOpenEnterpriseKnowledge: () => void;
  onOpenEnterpriseDelivery: () => void;
};

const OverviewTab: React.FC<OverviewTabProps> = ({
  isAdmin,
  tenantLabel,
  openIssueCount,
  visibleIssueCount,
  totalAgentCount,
  activeAgentCount,
  teamConversationCount,
  featuredIssueSubject,
  skillCount,
  enabledMcpCount,
  teamCount,
  ragDocumentCount,
  ragChunkCount,
  codeRepoCount,
  pipelineCount,
  onBreakdownIssue,
  onOpenTeamFlow,
  onOpenSharedTasks,
  onOpenSharedSessions,
  onOpenSkills,
  onOpenMcp,
  onOpenRuntimes,
  onOpenEnterpriseKnowledge,
  onOpenEnterpriseDelivery,
}) => {
  const { t } = useTranslation();
  const cards = isAdmin
    ? [
        {
          title: t('common.superAssistant.overview.adminActiveIssues', {
            defaultValue: '全队进行中 Issue',
          }),
          summary: t('common.superAssistant.overview.adminOpenIssuesSummary', {
            defaultValue: '当前共有 {{count}} 个未完成 Issue',
            count: openIssueCount,
          }),
        },
        {
          title: t('common.superAssistant.overview.adminActiveAgents', {
            defaultValue: '活跃 Agent',
          }),
          summary: t('common.superAssistant.overview.activeAgentsSummary', {
            defaultValue: '当前有 {{count}} 个 Agent 在协作',
            count: activeAgentCount,
          }),
        },
        {
          title: t('common.superAssistant.overview.adminRuntimeHealth', {
            defaultValue: '运行时健康',
          }),
          summary: t('common.superAssistant.overview.teamConversationsSummary', {
            defaultValue: '当前串联 {{count}} 个团队会话',
            count: teamConversationCount,
          }),
        },
        {
          title: t('common.superAssistant.overview.adminSkills', {
            defaultValue: '技能复用',
          }),
          summary: featuredIssueSubject
            ? t('common.superAssistant.overview.featuredIssueSummary', {
                defaultValue: '当前焦点：{{subject}}',
                subject: featuredIssueSubject,
              })
            : t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' }),
        },
      ]
    : [
        {
          title: t('common.superAssistant.overview.memberMyIssues', {
            defaultValue: '我参与的协作',
          }),
          summary: t('common.superAssistant.overview.memberMyIssuesSummary', {
            defaultValue: '我当前参与 {{count}} 个 Issue',
            count: visibleIssueCount,
          }),
        },
        {
          title: t('common.superAssistant.overview.memberAgents', {
            defaultValue: '相关 Agent 状态',
          }),
          summary: t('common.superAssistant.overview.activeAgentsSummary', {
            defaultValue: '当前有 {{count}} 个 Agent 在协作',
            count: totalAgentCount,
          }),
        },
        {
          title: t('common.superAssistant.overview.memberMentions', {
            defaultValue: '@我的评论',
          }),
          summary: t('common.superAssistant.overview.teamConversationsSummary', {
            defaultValue: '当前串联 {{count}} 个团队会话',
            count: teamConversationCount,
          }),
        },
        {
          title: t('common.superAssistant.overview.memberResults', {
            defaultValue: '最近协作结果',
          }),
          summary: featuredIssueSubject
            ? t('common.superAssistant.overview.featuredIssueSummary', {
                defaultValue: '当前焦点：{{subject}}',
                subject: featuredIssueSubject,
              })
            : t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' }),
        },
      ];

  return (
    <div className='space-y-12px'>
      {tenantLabel ? (
        <Card title={t('common.superAssistant.enterpriseWorkspaceTitle', { defaultValue: '企业 Agent 工作台' })}>
          <div className='mb-12px text-12px text-t-secondary'>
            {t('common.superAssistant.enterpriseWorkspaceSummary', {
              defaultValue:
                '已将原 CAgent 的企业知识、交付链路与受控执行入口并入超级助手，当前组织：{{tenant}}。',
              tenant: tenantLabel,
            })}
          </div>
          <div className='grid gap-12px md:grid-cols-3'>
            <Card title={t('common.superAssistant.enterpriseKnowledgeTitle', { defaultValue: '企业知识与工具' })}>
              <div className='text-12px text-t-tertiary'>
                {t('common.superAssistant.enterpriseKnowledgeDesc', {
                  defaultValue:
                    '已接入 {{ragCount}} 份知识文档（{{chunkCount}} 个切片）、{{skillCount}} 个技能、{{mcpCount}} 个 MCP 连接器。',
                  ragCount: ragDocumentCount,
                  chunkCount: ragChunkCount,
                  skillCount,
                  mcpCount: enabledMcpCount,
                })}
              </div>
              <div className='mt-10px flex flex-wrap gap-8px'>
                <Button size='small' type='primary' onClick={onOpenEnterpriseKnowledge}>
                  {t('common.superAssistant.enterpriseKnowledgeAction', { defaultValue: '打开企业知识与工具' })}
                </Button>
                <Button size='small' onClick={onOpenMcp}>
                  {t('common.superAssistant.openMcp', { defaultValue: '触发 MCP / 自动化' })}
                </Button>
              </div>
            </Card>
            <Card title={t('common.superAssistant.enterpriseDeliveryTitle', { defaultValue: '交付链路协同' })}>
              <div className='text-12px text-t-tertiary'>
                {t('common.superAssistant.enterpriseDeliveryDesc', {
                  defaultValue:
                    '当前串联 {{repoCount}} 个代码库、{{pipelineCount}} 条流水线，并与团队协作入口联动。',
                  repoCount: codeRepoCount,
                  pipelineCount,
                })}
              </div>
              <div className='mt-10px flex flex-wrap gap-8px'>
                <Button size='small' type='primary' onClick={onOpenEnterpriseDelivery}>
                  {t('common.superAssistant.enterpriseDeliveryAction', { defaultValue: '查看企业交付链路' })}
                </Button>
                <Button size='small' onClick={onOpenTeamFlow}>
                  {t('common.superAssistant.launchTeamFlow', { defaultValue: '拉起 Team 协作' })}
                </Button>
              </div>
            </Card>
            <Card title={t('common.superAssistant.enterpriseExecutionTitle', { defaultValue: '受控执行入口' })}>
              <div className='text-12px text-t-tertiary'>
                {t('common.superAssistant.enterpriseExecutionDesc', {
                  defaultValue:
                    '当前覆盖 {{teamCount}} 个团队与 {{conversationCount}} 个团队会话，共享会话会继承企业上下文。',
                  teamCount,
                  conversationCount: teamConversationCount,
                })}
              </div>
              <div className='mt-10px flex flex-wrap gap-8px'>
                <Button size='small' type='primary' onClick={onOpenSharedSessions}>
                  {t('common.superAssistant.createSharedSession', { defaultValue: '创建共享会话' })}
                </Button>
                <Button size='small' onClick={onOpenSharedTasks}>
                  {t('common.superAssistant.createSharedTask', { defaultValue: '创建共享任务' })}
                </Button>
              </div>
            </Card>
          </div>
        </Card>
      ) : null}

      <Card title={t('common.superAssistant.homeCapabilitiesTitle', { defaultValue: '我能帮你做什么' })}>
        <div className='grid gap-12px md:grid-cols-2 xl:grid-cols-4'>
          <Card title={t('common.superAssistant.homeCapabilityBreakdown', { defaultValue: '拆解共享 Issue' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeCapabilityBreakdownDesc', {
                defaultValue: '把当前焦点需求拆成可执行工作项，并回到 Issue 看板继续推进。',
              })}
            </div>
            <div className='mt-10px'>
              <Button size='small' type='primary' onClick={onBreakdownIssue}>
                {t('common.superAssistant.homeCapabilityBreakdownAction', { defaultValue: '拆解共享 Issue' })}
              </Button>
            </div>
          </Card>
          <Card title={t('common.superAssistant.homeCapabilityTeam', { defaultValue: '拉起 Team 协作' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeCapabilityTeamDesc', {
                defaultValue: '把团队工作区、代码和共享上下文串起来，让智能体进入同一个协作面。',
              })}
            </div>
            <div className='mt-10px'>
              <Button size='small' type='primary' onClick={onOpenTeamFlow}>
                {t('common.superAssistant.launchTeamFlow', { defaultValue: '拉起 Team 协作' })}
              </Button>
            </div>
          </Card>
          <Card title={t('common.superAssistant.homeCapabilityTasks', { defaultValue: '创建共享任务与会话' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeCapabilityTasksDesc', {
                defaultValue: '直接把当前焦点转成共享任务或共享会话，让团队和智能体接着干。',
              })}
            </div>
            <div className='mt-10px flex flex-wrap gap-8px'>
              <Button size='small' onClick={onOpenSharedTasks}>
                {t('common.superAssistant.createSharedTask', { defaultValue: '创建共享任务' })}
              </Button>
              <Button size='small' onClick={onOpenSharedSessions}>
                {t('common.superAssistant.createSharedSession', { defaultValue: '创建共享会话' })}
              </Button>
            </div>
          </Card>
          <Card title={t('common.superAssistant.homeCapabilitySkills', { defaultValue: '编排 Skills / MCP / 运行时' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeCapabilitySkillsDesc', {
                defaultValue: '把技能包、MCP 自动化和运行时连接起来，让超级助手持续执行而不是只负责跳转。',
              })}
            </div>
            <div className='mt-10px flex flex-wrap gap-8px'>
              <Button size='small' onClick={onOpenSkills}>
                {t('common.superAssistant.openSkills', { defaultValue: '打开 Skills 能力包' })}
              </Button>
              <Button size='small' onClick={onOpenMcp}>
                {t('common.superAssistant.openMcp', { defaultValue: '触发 MCP / 自动化' })}
              </Button>
            </div>
          </Card>
        </div>
      </Card>

      <Card title={t('common.superAssistant.homeExecutionTitle', { defaultValue: '当前执行流' })}>
        <div className='mb-12px text-12px text-t-secondary'>
          {featuredIssueSubject
            ? t('common.superAssistant.overview.featuredIssueSummary', {
                defaultValue: '当前焦点：{{subject}}',
                subject: featuredIssueSubject,
              })
            : t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' })}
        </div>
        <div className='grid gap-12px md:grid-cols-2 xl:grid-cols-4'>
          {cards.map((card) => (
            <Card key={card.title} title={card.title}>
              <div className='text-12px text-t-tertiary'>{card.summary}</div>
            </Card>
          ))}
        </div>
      </Card>

      <Card title={t('common.superAssistant.homeCapabilitySourcesTitle', { defaultValue: '能力来源' })}>
        <div className='grid gap-12px md:grid-cols-3'>
          <Card title={t('common.superAssistant.homeSourceSkills', { defaultValue: '技能与自动化' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeSourceSkillsSummary', {
                defaultValue: '已接入 {{count}} 个技能、{{mcpCount}} 个启用中的 MCP 连接器。',
                count: skillCount,
                mcpCount: enabledMcpCount,
              })}
            </div>
            <div className='mt-10px flex flex-wrap gap-8px'>
              <Button size='small' onClick={onOpenSkills}>
                {t('common.superAssistant.openSkills', { defaultValue: '打开 Skills 能力包' })}
              </Button>
              <Button size='small' onClick={onOpenMcp}>
                {t('common.superAssistant.openMcp', { defaultValue: '触发 MCP / 自动化' })}
              </Button>
            </div>
          </Card>
          <Card title={t('common.superAssistant.homeSourceRuntimes', { defaultValue: '运行时与智能体' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeSourceRuntimesSummary', {
                defaultValue: '当前有 {{agentCount}} 个 Agent、{{activeCount}} 个活跃 Agent。',
                agentCount: totalAgentCount,
                activeCount: activeAgentCount,
              })}
            </div>
            <div className='mt-10px'>
              <Button size='small' onClick={onOpenRuntimes}>
                {t('common.superAssistant.tabs.runtimes', { defaultValue: '运行时' })}
              </Button>
            </div>
          </Card>
          <Card title={t('common.superAssistant.homeSourceTeamContext', { defaultValue: '团队上下文' })}>
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.homeSourceTeamContextSummary', {
                defaultValue: '当前覆盖 {{teamCount}} 个团队、{{conversationCount}} 个团队会话。',
                teamCount,
                conversationCount: teamConversationCount,
              })}
            </div>
            <div className='mt-10px'>
              <Button size='small' onClick={onOpenTeamFlow}>
                {t('common.superAssistant.launchTeamFlow', { defaultValue: '拉起 Team 协作' })}
              </Button>
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
};

export default OverviewTab;
