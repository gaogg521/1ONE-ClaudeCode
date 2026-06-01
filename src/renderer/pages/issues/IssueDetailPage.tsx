import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Result, Space, Spin, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import type { RequirementCommentRecord, RequirementRecord } from '@/renderer/utils/enterpriseApi/modules';
import { listRequirementComments, listRequirementsTree } from '@/renderer/utils/enterpriseApi/modules';
import {
  countNestedChildren,
  findRequirementById,
  formatPriorityLabel,
  formatStatusLabel,
  priorityTagColor,
} from './issueUtils';

const IssueDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { issueId } = useParams<{ issueId: string }>();
  const { hasJoinedEnterprise } = useEditionFeatures();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<RequirementRecord[]>([]);
  const [comments, setComments] = useState<RequirementCommentRecord[]>([]);

  useEffect(() => {
    let disposed = false;
    if (!issueId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.allSettled([
      listRequirementsTree(),
      listRequirementComments(issueId),
    ]).then(([treeResult, commentResult]) => {
      if (disposed) {
        return;
      }
      setTree(treeResult.status === 'fulfilled' ? treeResult.value ?? [] : []);
      setComments(commentResult.status === 'fulfilled' ? commentResult.value ?? [] : []);
      setLoading(false);
    });

    return () => {
      disposed = true;
    };
  }, [issueId]);

  const currentIssue = useMemo(
    () => (issueId ? findRequirementById(tree, issueId) : null),
    [issueId, tree]
  );

  const childCount = countNestedChildren(currentIssue);

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
                      <Tag color='arcoblue'>{formatStatusLabel(currentIssue.status)}</Tag>
                      <Tag color={priorityTagColor(currentIssue.priority)}>
                        {formatPriorityLabel(currentIssue.priority)}
                      </Tag>
                    </div>
                    <Typography.Paragraph className='mt-16px mb-0 text-14px text-t-secondary whitespace-pre-wrap'>
                      {currentIssue.description ||
                        t('common.issues.noDescription', { defaultValue: '当前还没有补充描述。' })}
                    </Typography.Paragraph>
                  </div>
                  <Space wrap>
                    <Button type='primary' onClick={() => navigate(`/super-assistant?issueId=${encodeURIComponent(currentIssue.id)}`)}>
                      {t('common.issues.startWithAssistant', { defaultValue: '交给 Agent 助手处理' })}
                    </Button>
                    <Button onClick={() => navigate(`/enterprise/cteam?issueId=${encodeURIComponent(currentIssue.id)}&issueSubject=${encodeURIComponent(currentIssue.subject)}`)}>
                      {t('common.issues.openPlanningBoard', { defaultValue: '打开规划看板' })}
                    </Button>
                  </Space>
                </div>
              </Card>

              <Card title={t('common.issues.childrenTitle', { defaultValue: '子 Issue / 拆解结果' })}>
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
                            {formatStatusLabel(child.status)}
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
                      defaultValue: '当前还没有子 Issue，可在规划看板或超级助手中继续拆解。',
                    })}
                  />
                )}
              </Card>

              <Card title={t('common.issues.commentsTitle', { defaultValue: '动态 / 评论' })}>
                {comments.length ? (
                  <div className='space-y-12px'>
                    {comments
                      .toSorted((a, b) => Number(b.created_at) - Number(a.created_at))
                      .map((comment) => (
                        <div
                          key={comment.id}
                          className='rd-10px border border-solid border-[var(--color-border-2)] p-12px'
                        >
                          <div className='flex items-center gap-8px text-12px text-t-tertiary flex-wrap'>
                            <Tag size='small' color='gray'>
                              {comment.author_type}
                            </Tag>
                            <span>{comment.author_name}</span>
                            <span>{new Date(comment.created_at).toLocaleString()}</span>
                          </div>
                          <Typography.Paragraph className='mt-8px mb-0 text-13px text-t-secondary whitespace-pre-wrap'>
                            {comment.body}
                          </Typography.Paragraph>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty
                    description={t('common.issues.noComments', {
                      defaultValue: '当前还没有动态。后续可在这里汇总 Agent 回写和人工评论。',
                    })}
                  />
                )}
              </Card>
            </div>

            <div className='space-y-16px'>
              <Card title={t('common.issues.propertiesTitle', { defaultValue: '属性' })}>
                <div className='space-y-12px text-13px'>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyId', { defaultValue: 'ID' })}</div>
                    <div className='mt-4px text-t-primary'>{currentIssue.id}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyStatus', { defaultValue: '状态' })}</div>
                    <div className='mt-4px text-t-primary'>{formatStatusLabel(currentIssue.status)}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyPriority', { defaultValue: '优先级' })}</div>
                    <div className='mt-4px text-t-primary'>{formatPriorityLabel(currentIssue.priority)}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyAssignee', { defaultValue: '负责人' })}</div>
                    <div className='mt-4px text-t-primary'>
                      {currentIssue.assigned_to ||
                        t('common.issues.unassigned', { defaultValue: '未分配' })}
                    </div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyChildren', { defaultValue: '子项数量' })}</div>
                    <div className='mt-4px text-t-primary'>{childCount}</div>
                  </div>
                  <div>
                    <div className='text-t-tertiary'>{t('common.issues.propertyUpdatedAt', { defaultValue: '最近更新' })}</div>
                    <div className='mt-4px text-t-primary'>{new Date(currentIssue.updated_at).toLocaleString()}</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </Spin>
    </PageContentShell>
  );
};

export default IssueDetailPage;
