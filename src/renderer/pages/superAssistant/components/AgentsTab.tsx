import React from 'react';
import { Card, Empty, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { SuperAssistantTeamSummary } from '../hooks/useSuperAssistantData';

type AgentsTabProps = {
  teamSummaries: SuperAssistantTeamSummary[];
  teamConversationCount: number;
};

const AgentsTab: React.FC<AgentsTabProps> = ({ teamSummaries, teamConversationCount }) => {
  const { t } = useTranslation();
  const agentRows = [
    {
      key: 'leader',
      title: t('common.superAssistant.agents.rows.leaderTitle', { defaultValue: '超级助手 Leader' }),
      status: t('common.superAssistant.agents.rows.leaderStatus', { defaultValue: '在线' }),
      summary: t('common.superAssistant.agents.rows.leaderSummary', {
        defaultValue: '负责接单、拆解与编排模块动作。',
      }),
    },
    {
      key: 'dev',
      title: t('common.superAssistant.agents.rows.devTitle', { defaultValue: '开发 Agent' }),
      status: t('common.superAssistant.agents.rows.devStatus', { defaultValue: '进行中' }),
      summary: t('common.superAssistant.agents.rows.devSummary', {
        defaultValue: '推进编码与实现任务。',
      }),
    },
    {
      key: 'qa',
      title: t('common.superAssistant.agents.rows.qaTitle', { defaultValue: '测试 Agent' }),
      status: t('common.superAssistant.agents.rows.qaStatus', { defaultValue: '待命' }),
      summary: t('common.superAssistant.agents.rows.qaSummary', {
        defaultValue: '负责验证、回归与阻塞反馈。',
      }),
    },
    {
      key: 'product',
      title: t('common.superAssistant.agents.rows.productTitle', { defaultValue: '产品 Agent' }),
      status: t('common.superAssistant.agents.rows.productStatus', { defaultValue: '在线' }),
      summary: t('common.superAssistant.agents.rows.productSummary', {
        defaultValue: '辅助梳理需求、活动流与验收信息。',
      }),
    },
  ];

  return (
    <div className='space-y-12px'>
      <Card title={t('common.superAssistant.agentsHierarchyTitle', { defaultValue: '超级助手小队指挥链' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.agentsHierarchyDesc', {
            defaultValue: '管理员查看全队 Agent 指挥关系；成员查看自己参与的小队协作视图。',
          })}
        </div>
      </Card>
      {teamSummaries.length === 0 ? (
        <Empty
          description={t('common.superAssistant.noTeams', {
            defaultValue: '还没有团队',
          })}
        />
      ) : (
        <div className='grid gap-12px md:grid-cols-2'>
          {teamSummaries.map((team) => (
            <Card
              key={team.id}
              title={team.name}
              extra={
                <Tag color={team.activeAgentCount > 0 ? 'green' : 'blue'}>
                  {t('common.superAssistant.agentCount', {
                    defaultValue: '{{count}} 个协作 Agent',
                    count: team.agentCount,
                  })}
                </Tag>
              }
            >
              <div className='text-12px text-t-tertiary'>
                {[team.workspace, ...team.sampleAgentNames].filter(Boolean).join(' · ')}
              </div>
              <div className='mt-6px text-12px text-t-secondary'>
                {t('common.superAssistant.teamConversationCount', {
                  defaultValue: '{{count}} 个团队会话',
                  count: teamConversationCount,
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className='grid gap-12px md:grid-cols-2'>
        {agentRows.map((agent) => (
          <Card
            key={agent.key}
            title={agent.title}
            extra={<Tag color={agent.key === 'leader' ? 'arcoblue' : 'blue'}>{agent.status}</Tag>}
          >
            <div className='text-12px text-t-tertiary'>{agent.summary}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AgentsTab;
