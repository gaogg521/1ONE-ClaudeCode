import React, { useMemo } from 'react';
import { Avatar, Empty, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { RequirementCommentRecord, RequirementRecord } from '@/renderer/utils/enterpriseApi/modules';
import { formatStatusLabel } from '../issueUtils';

export type IssueActivityItem = {
  id: string;
  authorName: string;
  authorType: RequirementCommentRecord['author_type'] | 'system';
  action: string;
  createdAt: number;
  body?: string;
};

function formatRelativeTime(timestamp: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return t('common.issues.activityJustNow', { defaultValue: '刚刚' });
  }
  if (minutes < 60) {
    return t('common.issues.activityMinutesAgo', { defaultValue: '{{count}} 分钟前', count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('common.issues.activityHoursAgo', { defaultValue: '{{count}} 小时前', count: hours });
  }
  const days = Math.floor(hours / 24);
  return t('common.issues.activityDaysAgo', { defaultValue: '{{count}} 天前', count: days });
}

export function buildIssueActivityItems(
  issue: RequirementRecord,
  comments: RequirementCommentRecord[],
  t: (key: string, opts?: Record<string, unknown>) => string
): IssueActivityItem[] {
  const items: IssueActivityItem[] = [
    {
      id: `created-${issue.id}`,
      authorName: issue.creator_id,
      authorType: 'system',
      action: t('common.issues.activityCreated', { defaultValue: '创建了此 Issue' }),
      createdAt: issue.created_at,
    },
  ];

  if (issue.updated_at > issue.created_at + 1000) {
    items.push({
      id: `updated-${issue.id}`,
      authorName: t('common.issues.activitySystem', { defaultValue: '系统' }),
      authorType: 'system',
      action: t('common.issues.activityUpdated', {
        defaultValue: '更新了 Issue（状态：{{status}}）',
        status: formatStatusLabel(issue.status),
      }),
      createdAt: issue.updated_at,
    });
  }

  comments.forEach((comment) => {
    const metadataAction =
      comment.metadata && typeof comment.metadata.action === 'string' ? comment.metadata.action : null;
    const isUserComment = comment.author_type === 'user' && !metadataAction;
    items.push({
      id: comment.id,
      authorName: comment.author_name,
      authorType: comment.author_type,
      action: metadataAction
        ? metadataAction
        : isUserComment
          ? t('common.issues.activityCommented', { defaultValue: '发表了评论' })
          : comment.body,
      createdAt: comment.created_at,
      body: isUserComment ? comment.body : undefined,
    });
  });

  return items.toSorted((a, b) => b.createdAt - a.createdAt);
}

type IssueActivityTimelineProps = {
  items: IssueActivityItem[];
};

const IssueActivityTimeline: React.FC<IssueActivityTimelineProps> = ({ items }) => {
  const { t } = useTranslation();
  const grouped = useMemo(() => items, [items]);

  if (!grouped.length) {
    return (
      <Empty
        description={t('common.issues.noComments', {
          defaultValue: '当前还没有动态。后续可在这里汇总 Agent 回写和人工评论。',
        })}
      />
    );
  }

  return (
    <div className='space-y-14px'>
      {grouped.map((item) => (
        <div key={item.id} className='flex gap-10px'>
          <Avatar size={28} style={{ backgroundColor: 'var(--color-fill-3)', flexShrink: 0 }}>
            {item.authorName.slice(0, 1).toUpperCase()}
          </Avatar>
          <div className='min-w-0 flex-1'>
            <div className='text-13px text-t-primary'>
              <span className='font-600'>{item.authorName}</span>
              <span className='text-t-secondary'> {item.action}</span>
            </div>
            <div className='mt-2px text-11px text-t-tertiary'>{formatRelativeTime(item.createdAt, t)}</div>
            {item.body ? (
              <Typography.Paragraph className='mt-6px mb-0 text-12px text-t-secondary whitespace-pre-wrap'>
                {item.body}
              </Typography.Paragraph>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};

export default IssueActivityTimeline;
