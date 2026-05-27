/**
 * Enterprise Usage & Member Dashboard Page
 */
import React, { useCallback } from 'react';
import { Badge, Card, Grid, Progress, Statistic, Table, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import {
  listMemberDashboard,
  listMcpRegistry,
  listPipelines,
  listRagDocuments,
  listSkills,
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
  const isAdmin = isEnterpriseAdminRole(effectiveRole);

  const loadStats = useCallback(async () => {
    const [members, pipelines, ragDocuments, mcpTools, skills] = await Promise.all([
      listMemberDashboard(),
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
  }, []);

  const statsState = useEnterpriseAsyncData(
    loadStats,
    DEFAULT_USAGE_STATS,
    t('admin.usage.loadFailed', { defaultValue: '加载使用统计失败' })
  );

  const membersState = useEnterpriseAsyncData(
    listMemberDashboard,
    [],
    t('admin.usage.memberLoadFailed', { defaultValue: '加载成员状态失败' })
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
            isAdmin
              ? t('admin.usage.descAdmin', {
                  defaultValue: '企业团队资源使用全景与成员实时状态，统计各模块活跃数据。',
                })
              : t('admin.usage.descMember', {
                  defaultValue: '查看您所在团队可见的资源用量与队友状态（基于团队 membership 过滤）。',
                })
          }
        />

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
      </div>
    </AdminPageWrapper>
  );
};

export default EnterpriseUsagePage;
