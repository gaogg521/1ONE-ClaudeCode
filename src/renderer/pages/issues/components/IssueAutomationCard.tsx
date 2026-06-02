import React, { useState } from 'react';
import { Button, Card, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';
import { buildSuperAssistantAutopilotDefaults } from '@/renderer/pages/superAssistant/utils/autopilotDefaults';
import type { TeamAgent } from '@/common/types/teamTypes';

type IssueAutomationCardProps = {
  issueId: string;
  issueSubject: string;
  teamId?: string;
  leadAgent?: TeamAgent | null;
};

const IssueAutomationCard: React.FC<IssueAutomationCardProps> = ({
  issueId,
  issueSubject,
  teamId,
  leadAgent,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createVisible, setCreateVisible] = useState(false);

  const autopilotDefaults = buildSuperAssistantAutopilotDefaults({
    teamId,
    leadAgent: leadAgent ?? null,
    requirementId: issueId,
    postBackToIssue: true,
  });

  return (
    <>
      <Card title={t('common.issues.automationTitle', { defaultValue: '自动化' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.issues.automationDesc', {
            defaultValue:
              '为当前 Issue 配置定时 Agent 任务，实现 7×24 自动跟进（如每日扫描、周报汇总、阻塞提醒）。',
          })}
        </div>
        <div className='mt-10px flex flex-wrap gap-8px'>
          <Tag color='arcoblue'>{issueSubject}</Tag>
        </div>
        <div className='mt-12px flex flex-wrap gap-8px'>
          <Button type='primary' size='small' onClick={() => setCreateVisible(true)}>
            {t('common.issues.automationCreate', { defaultValue: '新建自动化' })}
          </Button>
          <Button size='small' type='outline' onClick={() => navigate('/scheduled')}>
            {t('common.issues.automationManage', { defaultValue: '管理定时任务' })}
          </Button>
        </div>
      </Card>
      <CreateTaskDialog
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        conversationTitle={issueSubject}
        initialName={t('common.issues.automationDefaultName', {
          defaultValue: 'Issue 自动跟进 · {{subject}}',
          subject: issueSubject,
        })}
        initialPrompt={t('common.issues.automationDefaultPrompt', {
          defaultValue:
            '你是 Issue「{{subject}}」的值班 Agent。请检查当前进展、阻塞项与下一步行动，输出简洁 Markdown 摘要；如有阻塞请 @ 相关负责人。',
          subject: issueSubject,
        })}
        initialFrequency='weekdays'
        initialAgentKey={autopilotDefaults?.initialAgentKey}
        autopilotContext={autopilotDefaults?.autopilotContext}
      />
    </>
  );
};

export default IssueAutomationCard;
