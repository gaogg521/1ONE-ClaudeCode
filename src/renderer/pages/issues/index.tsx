import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Result, Spin, Tag, Typography } from '@arco-design/web-react';
import { EveryUser, Plus, Right, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import AppLoader from '@/renderer/components/layout/AppLoader';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import type { RequirementRecord, RequirementStatus } from '@/renderer/utils/enterpriseApi/modules';
import { listRequirementsTree } from '@/renderer/utils/enterpriseApi/modules';
import {
  flattenIssues,
  formatPriorityLabel,
  formatStatusLabel,
  ISSUE_STATUS_ORDER,
  priorityTagColor,
  type IssueListItem,
} from './issueUtils';
import CreateIssueModal from './components/CreateIssueModal';
import { useIssueEnterpriseGate } from './useIssueEnterpriseGate';

const TasksPage = React.lazy(() => import('@/renderer/pages/tasks'));

type IssueFilter = 'all' | 'open' | 'mine' | 'high';
type IssuesViewTab = 'board' | 'tasks';

function resolveIssuesViewTab(search: string): IssuesViewTab {
  return new URLSearchParams(search).get('tab') === 'tasks' ? 'tasks' : 'board';
}

function pickStatusItems(items: IssueListItem[], status: RequirementStatus): IssueListItem[] {
  return items
    .filter((item) => item.status === status)
    .toSorted((a, b) => Number(b.updated_at) - Number(a.updated_at));
}

const IssuesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const enterpriseMode = useWebuiEnterpriseMode();
  const { ensureEnterpriseLogin } = useIssueEnterpriseGate();
  const { hasJoinedEnterprise, tenantLabel } = useEditionFeatures();
  const viewTab = useMemo(() => resolveIssuesViewTab(location.search), [location.search]);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<RequirementRecord[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<IssueFilter>('open');
  const [createVisible, setCreateVisible] = useState(false);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    void listRequirementsTree()
      .then((data) => {
        if (!disposed) {
          setTree(data ?? []);
        }
      })
      .catch(() => {
        if (!disposed) {
          setTree([]);
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  const issues = useMemo(() => flattenIssues(tree), [tree]);
  const searchLower = search.trim().toLowerCase();
  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      const matchesSearch =
        searchLower.length === 0 ||
        item.subject.toLowerCase().includes(searchLower) ||
        (item.description?.toLowerCase().includes(searchLower) ?? false) ||
        (item.epicSubject?.toLowerCase().includes(searchLower) ?? false);

      if (!matchesSearch) {
        return false;
      }

      if (filter === 'open') {
        return item.status !== 'completed';
      }
      if (filter === 'mine') {
        return Boolean(auth.user?.id) && item.assigned_to === auth.user?.id;
      }
      if (filter === 'high') {
        return item.priority === 'high' || item.priority === 'urgent';
      }
      return true;
    });
  }, [auth.user?.id, filter, issues, searchLower]);

  const issueStats = useMemo(
    () => ({
      total: issues.length,
      open: issues.filter((item) => item.status !== 'completed').length,
      active: issues.filter((item) => item.status === 'developing' || item.status === 'testing').length,
      urgent: issues.filter((item) => item.priority === 'urgent').length,
    }),
    [issues]
  );

  if (!hasJoinedEnterprise) {
    return (
      <Result
        status='403'
        title={t('common.issues.joinRequiredTitle', { defaultValue: '加入企业后可使用 Issues' })}
        subTitle={t('common.issues.joinRequiredDesc', {
          defaultValue: 'Issues 会复用企业需求树、团队协作和超级助手能力，请先加入企业组织。',
        })}
        extra={
          <Button type='primary' onClick={() => navigate('/sessions')}>
            {t('common.issues.backToWorkspace', { defaultValue: '返回主工作台' })}
          </Button>
        }
      />
    );
  }

  return (
    <PageContentShell className='issues-page-shell' contentClassName='max-w-1400px pb-40px'>
      <div className='flex items-start justify-between gap-16px flex-wrap'>
        <div className='min-w-0'>
          <div className='text-20px font-700 text-t-primary'>
            {t('common.issues.title', { defaultValue: 'Issues' })}
          </div>
          <div className='mt-4px text-13px text-t-tertiary'>
            {t('common.issues.subtitle', {
              defaultValue:
                '产品需求与团队任务统一在此管理。选中 Issue 后，可在 Agent 助手中直接发起处理。',
            })}
          </div>
          {tenantLabel ? (
            <div className='mt-8px text-12px text-t-secondary'>
              {t('common.issues.tenantHint', {
                defaultValue: '当前企业：{{tenant}}',
                tenant: tenantLabel,
              })}
            </div>
          ) : null}
        </div>
        <div className='flex items-center gap-8px flex-wrap'>
          <Button
            size='small'
            type='primary'
            icon={<Plus theme='outline' size='14' />}
            onClick={() => {
              if (ensureEnterpriseLogin('create')) {
                setCreateVisible(true);
              }
            }}
          >
            {t('common.issues.createButton', { defaultValue: '新建 Issue' })}
          </Button>
          <Button size='small' type='outline' onClick={() => navigate('/super-assistant')}>
            {t('common.issues.openAssistant', { defaultValue: '打开 Agent 助手' })}
          </Button>
          <Button size='small' onClick={() => navigate('/enterprise/cteam')}>
            {t('common.issues.openPlanningBoard', { defaultValue: '打开规划看板' })}
          </Button>
        </div>
      </div>

      <Card className='mt-16px'>
        <div className='flex items-center gap-8px flex-wrap'>
          {([
            ['board', t('common.issues.tabBoard', { defaultValue: '产品需求' })],
            ['tasks', t('common.issues.tabTasks', { defaultValue: '团队任务' })],
          ] as const).map(([tab, label]) => (
            <Button
              key={tab}
              size='small'
              type={viewTab === tab ? 'primary' : 'outline'}
              onClick={() => navigate(tab === 'tasks' ? '/issues?tab=tasks' : '/issues')}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>

      {viewTab === 'tasks' ? (
        <div className='mt-16px'>
          <Suspense fallback={<AppLoader />}>
            <TasksPage />
          </Suspense>
        </div>
      ) : null}

      {viewTab === 'board' ? (
        <>
      <div className='mt-16px grid gap-12px md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <div className='text-12px text-t-tertiary'>{t('common.issues.metricTotal', { defaultValue: '全部 Issues' })}</div>
          <div className='mt-6px text-24px font-700 text-t-primary'>{issueStats.total}</div>
        </Card>
        <Card>
          <div className='text-12px text-t-tertiary'>{t('common.issues.metricOpen', { defaultValue: '未完成' })}</div>
          <div className='mt-6px text-24px font-700 text-t-primary'>{issueStats.open}</div>
        </Card>
        <Card>
          <div className='text-12px text-t-tertiary'>{t('common.issues.metricActive', { defaultValue: '执行中 / 评审中' })}</div>
          <div className='mt-6px text-24px font-700 text-t-primary'>{issueStats.active}</div>
        </Card>
        <Card>
          <div className='text-12px text-t-tertiary'>{t('common.issues.metricUrgent', { defaultValue: '紧急优先级' })}</div>
          <div className='mt-6px text-24px font-700 text-t-primary'>{issueStats.urgent}</div>
        </Card>
      </div>

      <Card className='mt-16px'>
        <div className='flex items-center justify-between gap-12px flex-wrap'>
          <Input
            allowClear
            prefix={<Search theme='outline' size='16' />}
            placeholder={t('common.issues.searchPlaceholder', {
              defaultValue: '搜索标题、描述或所属 Epic',
            })}
            value={search}
            onChange={setSearch}
            style={{ width: 320 }}
          />
          <div className='flex items-center gap-8px flex-wrap'>
            {([
              ['open', t('common.issues.filterOpen', { defaultValue: '未完成' })],
              ['all', t('common.issues.filterAll', { defaultValue: '全部' })],
              ['mine', t('common.issues.filterMine', { defaultValue: '分配给我' })],
              ['high', t('common.issues.filterHigh', { defaultValue: '高优先级' })],
            ] as const).map(([key, label]) => (
              <Button
                key={key}
                size='small'
                type={filter === key ? 'primary' : 'outline'}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {auth.status !== 'authenticated' ? (
        <Alert
          className='mt-16px'
          type='warning'
          content={t('common.issues.enterpriseGuestHint', {
            defaultValue:
              '当前实例已接入企业，但你尚未登录企业账号。登录后将显示你的姓名、组织架构，并启用「分配给我」等筛选。',
          })}
          action={
            <Button size='mini' type='text' onClick={() => void enterpriseMode.openEnterpriseLoginInBrowser()}>
              {t('settings.edition.enterpriseLoginAction', { defaultValue: '登录企业账号' })}
            </Button>
          }
        />
      ) : null}

      <Spin className='w-full mt-16px' loading={loading}>
        {filteredIssues.length === 0 ? (
          <Card className='mt-16px'>
            <Empty
              description={t('common.issues.empty', {
                defaultValue: '当前没有可展示的 Issue，先在规划看板中创建需求或调整筛选条件。',
              })}
            />
          </Card>
        ) : (
          <div className='mt-16px flex gap-12px overflow-x-auto pb-8px'>
            {ISSUE_STATUS_ORDER.map((status) => {
              const items = pickStatusItems(filteredIssues, status);
              return (
                <Card
                  key={status}
                  className='min-w-260px flex-shrink-0'
                  title={
                    <div className='flex items-center justify-between gap-8px'>
                      <span>{formatStatusLabel(status, t)}</span>
                      <Tag size='small' color='arcoblue'>
                        {items.length}
                      </Tag>
                    </div>
                  }
                >
                  <div className='flex flex-col gap-10px'>
                    {items.length === 0 ? (
                      <div className='py-20px text-center text-12px text-t-tertiary'>
                        {t('common.issues.emptyColumn', { defaultValue: '暂无 Issue' })}
                      </div>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          className='cursor-pointer rd-10px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-12px transition-all hover:border-primary hover:bg-[var(--color-fill-2)]'
                          onClick={() => navigate(`/issues/${encodeURIComponent(item.id)}`)}
                        >
                          <div className='text-13px font-600 text-t-primary line-clamp-2'>{item.subject}</div>
                          {item.description ? (
                            <Typography.Paragraph className='mt-6px mb-0 text-12px text-t-tertiary line-clamp-2'>
                              {item.description}
                            </Typography.Paragraph>
                          ) : null}
                          <div className='mt-8px flex flex-wrap items-center gap-6px'>
                            <Tag size='small' color='gray'>
                              {item.type}
                            </Tag>
                            <Tag size='small' color={priorityTagColor(item.priority)}>
                              {formatPriorityLabel(item.priority, t)}
                            </Tag>
                            {item.assigned_to ? (
                              <Tag size='small' color='blue'>
                                <EveryUser theme='outline' size='12' className='mr-4px' />
                                {t('common.issues.assigned', { defaultValue: '已分配' })}
                              </Tag>
                            ) : null}
                          </div>
                          {item.epicSubject ? (
                            <div className='mt-8px text-11px text-t-tertiary'>
                              {t('common.issues.epicHint', {
                                defaultValue: 'Epic：{{epic}}',
                                epic: item.epicSubject,
                              })}
                            </div>
                          ) : null}
                          <div className='mt-10px flex items-center text-11px text-t-tertiary'>
                            <span>{new Date(item.updated_at).toLocaleString()}</span>
                            <Right theme='outline' size='12' className='ml-auto' />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Spin>
        </>
      ) : null}
      <CreateIssueModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={(id) => navigate(`/issues/${encodeURIComponent(id)}`)}
      />
    </PageContentShell>
  );
};

export default IssuesPage;
