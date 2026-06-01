import React from 'react';
import { Button, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type SuperAssistantHeaderProps = {
  tenantLabel: string | null;
  isAdmin: boolean;
  openIssueCount: number;
  activeAgentCount: number;
  skillCount: number;
  onStartCurrentIssue: () => void;
  onOpenRecentRun: () => void;
  onOpenIssues: () => void;
};

const SuperAssistantHeader: React.FC<SuperAssistantHeaderProps> = ({
  tenantLabel,
  isAdmin,
  openIssueCount,
  activeAgentCount,
  skillCount,
  onStartCurrentIssue,
  onOpenRecentRun,
  onOpenIssues,
}) => {
  const { t } = useTranslation();

  return (
    <div className='mb-16px flex items-start justify-between gap-12px flex-wrap'>
      <div className='min-w-0'>
        <div className='flex items-center gap-8px flex-wrap'>
          <div className='text-18px font-bold text-t-primary'>
            {t('common.superAssistant.title', { defaultValue: 'Agent 助手 / Issue 工作台' })}
          </div>
          <Tag color='blue'>
            {isAdmin
              ? t('common.superAssistant.adminViewTag', { defaultValue: '管理员视图' })
              : t('common.superAssistant.memberViewTag', { defaultValue: '协作视图' })}
          </Tag>
        </div>
        <div className='mt-4px text-12px text-t-tertiary'>
          {t('common.superAssistant.subtitle', {
            defaultValue:
              '先从当前 Issue 发起分析或执行，再在需要时进入调度、运行时和团队协作。',
          })}
        </div>
        {tenantLabel ? (
          <div className='mt-6px text-12px text-t-secondary'>
            {t('common.superAssistant.tenantHint', {
              defaultValue: '当前组织：{{tenant}}',
              tenant: tenantLabel,
            })}
          </div>
        ) : null}
        <div className='mt-8px flex flex-wrap gap-8px text-12px text-t-secondary'>
          <Tag color='arcoblue'>
            {t('common.superAssistant.header.openIssues', {
              defaultValue: '待处理任务 {{count}}',
              count: openIssueCount,
            })}
          </Tag>
          <Tag color='green'>
            {t('common.superAssistant.header.activeAgents', {
              defaultValue: '执行中智能体 {{count}}',
              count: activeAgentCount,
            })}
          </Tag>
          <Tag color='purple'>
            {t('common.superAssistant.header.skills', {
              defaultValue: '可复用技能 {{count}}',
              count: skillCount,
            })}
          </Tag>
        </div>
      </div>

      <div className='flex items-center gap-8px flex-wrap'>
        <Button size='small' type='primary' onClick={onStartCurrentIssue}>
          {t('common.superAssistant.headerStartWork', { defaultValue: '开始处理当前 Issue' })}
        </Button>
        <Button size='small' type='outline' onClick={onOpenRecentRun}>
          {t('common.superAssistant.headerRecentRun', { defaultValue: '查看最近运行' })}
        </Button>
        <Button size='small' type='outline' onClick={onOpenIssues}>
          {t('common.superAssistant.headerOpenIssues', { defaultValue: '进入 Issues' })}
        </Button>
      </div>
    </div>
  );
};

export default SuperAssistantHeader;
