import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Message, Result, Select, Space, Spin, Tag, Typography } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import type {
  RequirementCommentRecord,
  RequirementPriority,
  RequirementRecord,
  RequirementStatus,
} from '@/renderer/utils/enterpriseApi/modules';
import {
  listRequirementComments,
  listRequirementsTree,
  updateRequirement,
} from '@/renderer/utils/enterpriseApi/modules';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';
import CreateIssueModal from './components/CreateIssueModal';
import { useIssueEnterpriseGate } from './useIssueEnterpriseGate';
import IssueActivityTimeline, { buildIssueActivityItems } from './components/IssueActivityTimeline';
import IssueAutomationCard from './components/IssueAutomationCard';
import IssueCommentComposer from './components/IssueCommentComposer';
import {
  countNestedChildren,
  findRequirementById,
  formatPriorityLabel,
  formatStatusLabel,
  ISSUE_STATUS_ORDER,
  priorityTagColor,
} from './issueUtils';

const IssueDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { issueId } = useParams<{ issueId: string }>();
  const auth = useAuth();
  const { hasJoinedEnterprise } = useEditionFeatures();
  const { teams } = useTeamList();
  const { ensureEnterpriseLogin } = useIssueEnterpriseGate();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<RequirementRecord[]>([]);
  const [comments, setComments] = useState<RequirementCommentRecord[]>([]);
  const [createChildVisible, setCreateChildVisible] = useState(false);
  const [savingField, setSavingField] = useState(false);

  const reload = useCallback(async () => {
    if (!issueId) {
      return;
    }
    const [treeResult, commentResult] = await Promise.allSettled([
      listRequirementsTree(),
      listRequirementComments(issueId),
    ]);
    setTree(treeResult.status === 'fulfilled' ? treeResult.value ?? [] : []);
    setComments(commentResult.status === 'fulfilled' ? commentResult.value ?? [] : []);
  }, [issueId]);

  useEffect(() => {
    let disposed = false;
    if (!issueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload().finally(() => {
      if (!disposed) {
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
    };
  }, [issueId, reload]);

  const currentIssue = useMemo(
    () => (issueId ? findRequirementById(tree, issueId) : null),
    [issueId, tree]
  );

  const childCount = countNestedChildren(currentIssue);
  const primaryTeam = teams[0] ?? null;
  const leadAgent = primaryTeam?.agents.find((agent) => agent.slotId === primaryTeam.leadAgentId) ?? primaryTeam?.agents[0] ?? null;

  const activityItems = useMemo(
    () => (currentIssue ? buildIssueActivityItems(currentIssue, comments, t) : []),
    [comments, currentIssue, t]
  );

  const patchIssue = async (payload: Record<string, unknown>) => {
    if (!currentIssue || !ensureEnterpriseLogin('update')) {
      return;
    }
    setSavingField(true);
    try {
      await updateRequirement(currentIssue.id, payload);
      await reload();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(error, t('common.issues.updateFailed', { defaultValue: '更新 Issue 失败' }))
      );
    } finally {
      setSavingField(false);
    }
  };

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
    <PageContentShell className='issue-detail-shell' contentClassName='max-w-1400px pb-40px'>
      <div className='flex items-center gap-8px text-12px text-t-tertiary'>
        <Button size='mini' type='text' onClick={() => navigate('/issues')}>
          {t('common.issues.title', { defaultValue: 'Issues' })}
        </Button>
        <span>/</span>
        <span>{currentIssue?.id ?? issueId}</span>
      </div>

      <Spin className='w-full mt-16px' loading={loading}>
        {!currentIssue ? (
          <Card className='mt-16px'>
            <Empty
              description={t('common.issues.notFound', {
                defaultValue: '没有找到这个 Issue，可能已被删除或你当前无权限访问。',
              })}
            />
          </Card>
        ) : (
          <div className='mt-16px grid gap-16px xl:grid-cols-[minmax(0,1fr)_320px]'>
            <div className='space-y-16px'>
              <Card>
                <div className='flex items-start justify-between gap-12px flex-wrap'>
                  <div className='min-w-0 flex-1'>
                    <div className='text-24px font-700 text-t-primary break-words'>{currentIssue.subject}</div>
                    <div className='mt-10px flex flex-wrap gap-8px'>
                      <Tag color='gray'>{currentIssue.type}</Tag>
                      <Tag color='arcoblue'>{formatStatusLabel(currentIssue.status, t)}</Tag>
                      <Tag color={priorityTagColor(currentIssue.priority)}>
                        {formatPriorityLabel(currentIssue.priority, t)}
                      </Tag>
                    </div>
                    <Typography.Paragraph className='mt-16px mb-0 text-14px text-t-secondary whitespace-pre-wrap'>
                      {currentIssue.description ||
                        t('common.issues.noDescription', { defaultValue: '当前还没有补充描述。' })}
                    </Typography.Paragraph>
                  </div>
                  <Space wrap>
                    <Button
                      type='primary'
                      onClick={() => navigate(`/super-assistant?issueId=${encodeURIComponent(currentIssue.id)}`)}
                    >
                      {t('common.issues.startWithAssistant', { defaultValue: '交给 Agent 助手处理' })}
                    </Button>
                    <Button onClick={() => navigate(`/enterprise/cteam?issueId=${encodeURIComponent(currentIssue.id)}&issueSubject=${encodeURIComponent(currentIssue.subject)}`)}>
                      {t('common.issues.openPlanningBoard', { defaultValue: '打开规划看板' })}
                    </Button>
                  </Space>
                </div>
              </Card>

              <Card
                title={t('common.issues.childrenTitle', { defaultValue: '子 Issue / 拆解结果' })}
                extra={
                  <Button
                    size='mini'
                    type='text'
                    icon={<Plus theme='outline' size='14' />}
                    onClick={() => {
                      if (ensureEnterpriseLogin('create')) {
                        setCreateChildVisible(true);
                      }
                    }}
                  >
                    {t('common.issues.addSubIssue', { defaultValue: '添加' })}
                  </Button>
                }
              >
                {currentIssue.children?.length ? (
                  <div className='space-y-10px'>
                    {currentIssue.children.map((child) => (
                      <div
                        key={child.id}
                        className='cursor-pointer rd-10px border border-solid border-[var(--color-border-2)] p-12px transition-all hover:border-primary hover:bg-[var(--color-fill-2)]'
                        onClick={() => navigate(`/issues/${encodeURIComponent(child.id)}`)}
                      >
                        <div className='flex items-center gap-8px flex-wrap'>
                          <div className='text-13px font-600 text-t-primary'>{child.subject}</div>
                          <Tag size='small' color='gray'>
                            {child.type}
                          </Tag>
                          <Tag size='small' color='arcoblue'>
                            {formatStatusLabel(child.status, t)}
                          </Tag>
                        </div>
                        {child.description ? (
                          <Typography.Paragraph className='mt-6px mb-0 text-12px text-t-tertiary line-clamp-2'>
                            {child.description}
                          </Typography.Paragraph>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    description={t('common.issues.noChildren', {
                      defaultValue: '当前还没有子 Issue，点击右上角添加或交给 Agent 助手拆解。',
                    })}
                  />
                )}
              </Card>

              <Card title={t('common.issues.commentsTitle', { defaultValue: '动态' })}>
                <IssueActivityTimeline items={activityItems} />
                <IssueCommentComposer issueId={currentIssue.id} onPosted={() => void reload()} />
              </Card>
            </div>

            <div className='space-y-16px'>
              <Card title={t('common.issues.propertiesTitle', { defaultValue: '属性' })}>
                <div className='space-y-14px text-13px'>
                  <div>
                    <div className='text-t-tertiary mb-6px'>{t('common.issues.propertyStatus', { defaultValue: '状态' })}</div>
                    <Select
                      value={currentIssue.status}
                      disabled={savingField}
                      onChange={(value) => void patchIssue({ status: value as RequirementStatus })}
                    >
                      {ISSUE_STATUS_ORDER.map((status) => (
                        <Select.Option key={status} value={status}>
                          {formatStatusLabel(status, t)}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <div className='text-t-tertiary mb-6px'>{t('common.issues.propertyPriority', { defaultValue: '优先级' })}</div>
                    <Select
                      value={currentIssue.priority}
                      disabled={savingField}
                      onChange={(value) => void patchIssue({ priority: value as RequirementPriority })}
                    >
                      {(['low', 'medium', 'high', 'urgent'] as const).map((priority) => (
                        <Select.Option key={priority} value={priority}>
                          {formatPriorityLabel(priority, t)}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyAssignee', { defaultValue: '负责人' })}</div>
                    <div className='mt-4px text-t-primary'>
                      {currentIssue.assigned_to || auth.user?.username || t('common.issues.unassigned', { defaultValue: '未分配' })}
                    </div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyId', { defaultValue: 'ID' })}</div>
                    <div className='mt-4px text-t-primary break-all'>{currentIssue.id}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyChildren', { defaultValue: '子项数量' })}</div>
                    <div className='mt-4px text-t-primary'>{childCount}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyCreatedAt', { defaultValue: '创建时间' })}</div>
                    <div className='mt-4px text-t-primary'>{new Date(currentIssue.created_at).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyUpdatedAt', { defaultValue: '最近更新' })}</div>
                    <div className='mt-4px text-t-primary'>{new Date(currentIssue.updated_at).toLocaleString()}</div>
                  </div>
                </div>
              </Card>

              <IssueAutomationCard
                issueId={currentIssue.id}
                issueSubject={currentIssue.subject}
                teamId={primaryTeam?.id}
                leadAgent={leadAgent}
              />
            </div>
          </div>
        )}
      </Spin>

      {currentIssue ? (
        <CreateIssueModal
          visible={createChildVisible}
          parentId={currentIssue.id}
          defaultType='task'
          onClose={() => setCreateChildVisible(false)}
          onCreated={(id) => {
            void reload();
            navigate(`/issues/${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </PageContentShell>
  );
};

export default IssueDetailPage;
