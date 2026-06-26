/**
 * Enterprise Usage & Member Dashboard Page
 */
import React, { useCallback } from 'react';
import { Badge, Card, Grid, Progress, Statistic, Table, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import {
  listAgentTokenUsage,
  listMemberDashboard,
  listMcpRegistry,
  listPipelines,
  listRagDocuments,
  listSkills,
  type AgentTokenUsageRecord,
  type MemberDashboardRecord,
} from '@/renderer/utils/enterpriseApi/modules';

const { Row, Col } = Grid;

const DEFAULT_USAGE_STATS = {
  users: 0,
  pipelines: 0,
  ragDocs: 0,
  mcpTools: 0,
  skills: 0,
};

const EnterpriseUsagePage: React.FC = () => {
  const { t } = useTranslation();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const { isEnterpriseEdition } = useEditionFeatures();
  const isAdmin = isEnterpriseAdminRole(effectiveRole);
  // 个人版：只显示 Token 排行，不显示成员看板和资源统计卡。
  const showEnterprisePanels = isEnterpriseEdition;

  const membersState = useEnterpriseAsyncData(
    // 个人版不调用成员看板接口（个人版无"成员"概念，避免无意义请求）。
    showEnterprisePanels ? listMemberDashboard : async (): Promise<MemberDashboardRecord[]> => [],
    [],
    t('admin.usage.memberLoadFailed', { defaultValue: '加载成员状态失败' })
  );

  const loadStats = useCallback(async () => {
    if (!showEnterprisePanels) {
      // 个人版：资源统计卡不显示，直接返回默认值，避免无意义请求。
      return { users: 0, pipelines: 0, ragDocs: 0, mcpTools: 0, skills: 0 };
    }
    // 复用 membersState 的数据，避免重复请求 listMemberDashboard。
    const members = membersState.data;
    const [pipelines, ragDocuments, mcpTools, skills] = await Promise.all([
      listPipelines(),
      listRagDocuments(),
      listMcpRegistry(),
      listSkills(),
    ]);
    return {
      users: members.length,
      pipelines: pipelines.length,
      ragDocs: ragDocuments.reduce((sum, doc) => sum + (Number(doc.chunk_count) || 0), 0),
      mcpTools: mcpTools.filter((item) => Boolean(item.enabled)).length,
      skills: skills.length,
    };
  }, [membersState.data, showEnterprisePanels]);

  const statsState = useEnterpriseAsyncData(
    loadStats,
    DEFAULT_USAGE_STATS,
    t('admin.usage.loadFailed', { defaultValue: '加载使用统计失败' })
  );

  const agentUsageState = useEnterpriseAsyncData(
    // 个人版也展示 Token 排行（后端按 tenant_id='default' 聚合个人会话）。
    () => listAgentTokenUsage(30),
    { days: 30, totalTokens: 0, agents: [] as AgentTokenUsageRecord[] },
    t('admin.usage.agentTokensLoadFailed', { defaultValue: '加载 Agent Token 统计失败' })
  );

  const statCards = [
    {
      title: isAdmin
        ? t('admin.usage.statMembers', { defaultValue: '企业成员' })
        : t('admin.usage.statTeamMembers', { defaultValue: '团队成员' }),
      value: statsState.data.users,
    },
    { title: t('admin.usage.statRag', { defaultValue: 'RAG 知识切片' }), value: statsState.data.ragDocs },
    { title: t('admin.usage.statMcp', { defaultValue: 'MCP 工具' }), value: statsState.data.mcpTools },
    { title: t('admin.usage.statSkills', { defaultValue: 'Skills 技能' }), value: statsState.data.skills },
    { title: t('admin.usage.statPipelines', { defaultValue: '流水线数量' }), value: statsState.data.pipelines },
  ];

  const onlineCount = membersState.data.filter((m) => m.is_online).length;

  const memberColumns = [
    {
      title: t('admin.usage.memberName', { defaultValue: '成员' }),
      dataIndex: 'username',
      render: (name: string, record: MemberDashboardRecord) => (
        <div className='flex items-center gap-8px'>
          <Badge
            status={record.is_online ? 'processing' : 'default'}
            dot
          />
          <span className='font-600 text-t-primary'>{name}</span>
        </div>
      ),
    },
    {
      title: t('admin.usage.memberRole', { defaultValue: '角色' }),
      dataIndex: 'role',
      width: 100,
      render: (role: string) => (
        <Tag color={role === 'org_admin' || role === 'admin' ? 'arcoblue' : 'gray'} size='small'>
          {role === 'org_admin' || role === 'admin' ? '管理员' : '成员'}
        </Tag>
      ),
    },
    {
      title: t('admin.usage.memberStatus', { defaultValue: '在线状态' }),
      dataIndex: 'is_online',
      width: 100,
      render: (online: boolean, record: MemberDashboardRecord) => (
        <div>
          <Tag color={online ? 'green' : 'gray'} size='small'>
            {online ? '在线' : '离线'}
          </Tag>
          {!online && record.last_login > 0 && (
            <div className='text-11px text-t-tertiary mt-2px'>
              {t('admin.usage.lastSeen', {
                defaultValue: '最近：{{time}}',
                time: new Date(record.last_login).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('admin.usage.memberTasks', { defaultValue: '任务完成' }),
      key: 'tasks',
      render: (_: unknown, record: MemberDashboardRecord) => {
        const total = record.tasks_total;
        const completed = record.tasks_completed;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return (
          <div className='min-w-120px'>
            <div className='flex justify-between text-12px mb-4px'>
              <span className='text-t-secondary'>
                {t('admin.usage.taskProgress', {
                  defaultValue: '{{completed}}/{{total}} 已完成',
                  completed,
                  total,
                })}
              </span>
              {record.tasks_in_progress > 0 && (
                <Tag size='small' color='orange'>
                  {t('admin.usage.taskInProgress', { defaultValue: '{{n}} 进行中', n: record.tasks_in_progress })}
                </Tag>
              )}
            </div>
            {total > 0 && (
              <Progress
                percent={pct}
                size='small'
                color={pct >= 80 ? '#00b42a' : pct >= 40 ? '#ff7d00' : 'rgb(var(--primary-6))'}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AdminPageWrapper>
      <div className='max-w-1200px mx-auto flex flex-col gap-24px'>
        <ModulePageHeader
          title={t('settings.enterpriseConsole.navUsage', { defaultValue: '使用统计' })}
          description={
            showEnterprisePanels
              ? isAdmin
                ? t('admin.usage.descAdmin', {
                    defaultValue: '企业团队资源使用全景与成员实时状态，统计各模块活跃数据。',
                  })
                : t('admin.usage.descMember', {
                    defaultValue: '查看您所在团队可见的资源用量与队友状态（基于团队 membership 过滤）。',
                  })
              : t('admin.usage.descPersonal', {
                  defaultValue: '统计您各会话与智能体的 Token 用量，近 30 天数据。',
                })
          }
        />

        {showEnterprisePanels ? (
          <ModuleDataState
            loading={statsState.loading}
            error={statsState.error}
            empty={false}
            emptyDescription=''
          >
            <Row gutter={[16, 16]}>
              {statCards.map((card) => (
                <Col key={card.title} xs={12} sm={8} lg={6}>
                  <Card
                    bordered={false}
                    className='rd-12px text-center'
                    style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                  >
                    <Statistic title={card.title} value={card.value} />
                  </Card>
                </Col>
              ))}
            </Row>
          </ModuleDataState>
        ) : null}

        {showEnterprisePanels ? (
          <Card
            bordered={false}
            className='rd-12px'
            title={
              <div className='flex items-center gap-12px'>
                <span className='font-600'>
                  {isAdmin
                    ? t('admin.usage.memberBoard', { defaultValue: '成员看板' })
                  : t('admin.usage.teamMemberBoard', { defaultValue: '团队成员看板' })}
              </span>
              <Tag color='green' size='small'>
                {t('admin.usage.onlineCount', { defaultValue: '{{n}} 人在线', n: onlineCount })}
              </Tag>
              <Typography.Text type='secondary' className='text-12px font-400'>
                {t('admin.usage.onlineHint', { defaultValue: '15 分钟内有活动视为在线' })}
              </Typography.Text>
            </div>
          }
        >
          <ModuleDataState
            loading={membersState.loading}
            error={membersState.error}
            empty={membersState.data.length === 0}
            emptyDescription={
              isAdmin
                ? t('admin.usage.noMembers', { defaultValue: '暂无成员数据' })
                : t('admin.usage.noTeamMembers', { defaultValue: '暂无同团队成员数据，请先加入团队' })
            }
          >
            <Table
              data={membersState.data}
              rowKey='id'
              columns={memberColumns}
              pagination={{ pageSize: 20, showTotal: true, size: 'small' }}
              size='small'
              border={false}
            />
          </ModuleDataState>
        </Card>
      ) : null}

      <Card
        bordered={false}
        className='rd-12px'
        title={t('admin.usage.agentTokenBoard', { defaultValue: '数字员工 Token 排行' })}
      >
        <Typography.Paragraph type='secondary' className='text-12px mt-0 mb-12px'>
          {t('admin.usage.agentTokenBoardHint', {
            defaultValue:
              '按近 {{days}} 天会话汇总（基于会话 extra.lastTokenUsage 快照；未单独计费）。',
            days: agentUsageState.data.days,
          })}
        </Typography.Paragraph>
        <ModuleDataState
          loading={agentUsageState.loading}
          error={agentUsageState.error}
          empty={agentUsageState.data.agents.length === 0}
          emptyDescription={t('admin.usage.agentTokenEmpty', {
            defaultValue: '暂无会话 Token 记录。发起对话后这里会统计各智能体的 Token 用量。',
          })}
        >
          <div className='mb-12px'>
            <Statistic
              title={t('admin.usage.agentTokenTotal', { defaultValue: '合计 Token（估算）' })}
              value={agentUsageState.data.totalTokens}
              groupSeparator
            />
          </div>
          <Table
            data={agentUsageState.data.agents}
            rowKey='agentKey'
            size='small'
            border={false}
            pagination={{ pageSize: 10, showTotal: true }}
            columns={[
              {
                title: t('admin.usage.agentTokenName', { defaultValue: '智能体' }),
                dataIndex: 'agentName',
              },
              {
                title: t('admin.usage.agentTokenSource', { defaultValue: '类型' }),
                dataIndex: 'source',
                render: (value: AgentTokenUsageRecord['source']) => (
                  <Tag size='small' color={value === 'personal' ? 'arcoblue' : 'purple'}>
                    {value === 'personal'
                      ? t('admin.usage.agentTokenPersonal', { defaultValue: '个人数字员工' })
                      : value === 'team'
                        ? t('admin.usage.agentTokenTeam', { defaultValue: '团队 Agent' })
                        : t('admin.usage.agentTokenSession', { defaultValue: '会话' })}
                  </Tag>
                ),
              },
              {
                title: t('admin.usage.agentTokenConversations', { defaultValue: '会话数' }),
                dataIndex: 'conversationCount',
              },
              {
                title: t('admin.usage.agentTokenTotalCol', { defaultValue: 'Token' }),
                dataIndex: 'totalTokens',
                render: (value: number) => value.toLocaleString(),
              },
              {
                title: t('admin.usage.agentTokenModel', { defaultValue: '模型' }),
                dataIndex: 'model',
                render: (value?: string) => value || '—',
              },
              {
                title: t('admin.usage.agentTokenCalls', { defaultValue: '次数' }),
                dataIndex: 'callCount',
                render: (value?: number) => (value ?? 0).toLocaleString(),
              },
              {
                title: t('admin.usage.agentTokenSuccessRate', { defaultValue: '成功率' }),
                key: 'successRate',
                render: (_: unknown, record: AgentTokenUsageRecord) => {
                  const total = record.callCount ?? 0;
                  if (total <= 0) return '—';
                  const rate = Math.round(((total - (record.errorCount ?? 0)) / total) * 100);
                  return (
                    <Tag size='small' color={rate >= 90 ? 'green' : rate >= 70 ? 'orange' : 'red'}>
                      {rate}%
                    </Tag>
                  );
                },
              },
              {
                title: t('admin.usage.agentTokenFailRate', { defaultValue: '失败率' }),
                key: 'failRate',
                render: (_: unknown, record: AgentTokenUsageRecord) => {
                  const total = record.callCount ?? 0;
                  if (total <= 0) return '—';
                  const rate = Math.round(((record.errorCount ?? 0) / total) * 100);
                  return `${rate}%`;
                },
              },
            ]}
          />
        </ModuleDataState>
      </Card>
      </div>
    </AdminPageWrapper>
  );
};

export default EnterpriseUsagePage;
