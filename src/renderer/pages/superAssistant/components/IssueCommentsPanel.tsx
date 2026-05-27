import React, { useCallback, useEffect, useState } from 'react';
import { Empty, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import {
  listRequirementComments,
  type RequirementCommentRecord,
} from '@/renderer/utils/enterpriseApi/modules';

type IssueCommentsPanelProps = {
  requirementId: string | null;
  refreshToken?: number;
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const IssueCommentsPanel: React.FC<IssueCommentsPanelProps> = ({ requirementId, refreshToken = 0 }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<RequirementCommentRecord[]>([]);

  const loadComments = useCallback(async () => {
    if (!requirementId) {
      setComments([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listRequirementComments(requirementId);
      setComments(rows);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [requirementId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments, refreshToken]);

  if (!requirementId) {
    return null;
  }

  return (
    <div className='mt-12px'>
      <div className='text-11px font-600 text-t-tertiary mb-6px uppercase tracking-wide'>
        {t('common.superAssistant.issueCommentsTitle', { defaultValue: 'Issue 动态' })}
      </div>
      {loading ? (
        <div className='py-12px flex justify-center'>
          <Spin size={16} />
        </div>
      ) : comments.length === 0 ? (
        <Empty
          description={t('common.superAssistant.issueCommentsEmpty', {
            defaultValue: '暂无评论；Autopilot 执行完成后会自动回写结果',
          })}
        />
      ) : (
        <div className='flex flex-col gap-8px max-h-220px overflow-y-auto'>
          {comments.map((comment) => (
            <div key={comment.id} className='p-10px bg-fill-2 rd-8px'>
              <div className='flex items-center justify-between gap-8px mb-4px'>
                <span className='text-12px font-600 text-t-primary'>
                  {comment.author_type === 'autopilot' ? '🤖 ' : ''}
                  {comment.author_name}
                </span>
                <span className='text-10px text-t-tertiary'>{formatTime(comment.created_at)}</span>
              </div>
              <pre className='m-0 whitespace-pre-wrap break-words text-12px text-t-secondary font-inherit leading-relaxed'>
                {comment.body}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default IssueCommentsPanel;
