import React from 'react';
import { Button, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type SuperAssistantHeaderProps = {
  tenantLabel: string | null;
  isAdmin: boolean;
  openIssueCount: number;
  activeAgentCount: number;
  skillCount: number;
  onOpenKanban: () => void;
  onOpenTeamFlow: () => void;
  onCreateSharedTask: () => void;
};

const SuperAssistantHeader: React.FC<SuperAssistantHeaderProps> = ({
  tenantLabel,
  isAdmin,
  openIssueCount,
  activeAgentCount,
  skillCount,
  onOpenKanban,
  onOpenTeamFlow,
  onCreateSharedTask,
}) => {
  const { t } = useTranslation();

  return (
    <div className='mb-16px flex items-start justify-between gap-12px flex-wrap'>
      <div className='min-w-0'>
        <div className='flex items-center gap-8px flex-wrap'>
          <div className='text-18px font-bold text-t-primary'>
            {t('common.superAssistant.title', { defaultValue: '超级助手 / 企业 Agent 工作台' })}
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
              '把“分配任务 -> 执行进度 -> 结果沉淀”放在同一个页面，像管理同事一样管理智能体。',
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
        <Button size='small' type='outline' onClick={onOpenKanban}>
          {t('common.superAssistant.headerKanban', { defaultValue: '打开协作看板' })}
        </Button>
        <Button size='small' type='outline' onClick={onOpenTeamFlow}>
          {t('common.superAssistant.headerTeamFlow', { defaultValue: '拉起 Team 协作' })}
        </Button>
        <Button size='small' type='primary' onClick={onCreateSharedTask}>
          {t('common.superAssistant.headerCreateTask', { defaultValue: '创建共享任务' })}
        </Button>
      </div>
    </div>
  );
};

export default SuperAssistantHeader;
