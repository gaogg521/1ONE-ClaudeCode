import React from 'react';
import { Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type OverviewTabProps = {
  isAdmin: boolean;
  openIssueCount: number;
  visibleIssueCount: number;
  totalAgentCount: number;
  activeAgentCount: number;
  teamConversationCount: number;
  featuredIssueSubject?: string | null;
};

const OverviewTab: React.FC<OverviewTabProps> = ({
  isAdmin,
  openIssueCount,
  visibleIssueCount,
  totalAgentCount,
  activeAgentCount,
  teamConversationCount,
  featuredIssueSubject,
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
    <div className='grid gap-12px md:grid-cols-2 xl:grid-cols-4'>
      {cards.map((card) => (
        <Card key={card.title} title={card.title}>
          <div className='text-12px text-t-tertiary'>{card.summary}</div>
        </Card>
      ))}
    </div>
  );
};

export default OverviewTab;
