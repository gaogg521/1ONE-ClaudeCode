import React, { useState } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import { createRequirementComment } from '@/renderer/utils/enterpriseApi/modules';

type IssueCommentComposerProps = {
  issueId: string;
  onPosted: () => void;
};

const IssueCommentComposer: React.FC<IssueCommentComposerProps> = ({ issueId, onPosted }) => {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      Message.warning(t('common.issues.commentRequired', { defaultValue: '请输入评论内容' }));
      return;
    }
    setPosting(true);
    try {
      await createRequirementComment(issueId, trimmed);
      setBody('');
      onPosted();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(error, t('common.issues.commentFailed', { defaultValue: '发表评论失败' }), {
          not_authenticated: t('common.issues.loginRequiredToComment', {
            defaultValue: '当前无法发表评论，请稍后重试。',
          }),
        })
      );
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className='mt-16px pt-16px border-t border-solid border-[var(--color-border-2)]'>
      <Input.TextArea
        value={body}
        onChange={setBody}
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={t('common.issues.commentPlaceholder', { defaultValue: '留下评论…' })}
      />
      <div className='mt-8px flex justify-end'>
        <Button type='primary' size='small' loading={posting} onClick={() => void handlePost()}>
          {t('common.issues.commentSubmit', { defaultValue: '发送' })}
        </Button>
      </div>
    </div>
  );
};

export default IssueCommentComposer;
