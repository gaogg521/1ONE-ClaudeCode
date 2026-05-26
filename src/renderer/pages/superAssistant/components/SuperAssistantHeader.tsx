import React from 'react';
import { Button, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type SuperAssistantHeaderProps = {
  tenantLabel: string | null;
  isAdmin: boolean;
  onOpenOverview: () => void;
  onOpenIssues: () => void;
};

const SuperAssistantHeader: React.FC<SuperAssistantHeaderProps> = ({
  tenantLabel,
  isAdmin,
  onOpenOverview,
  onOpenIssues,
}) => {
  const { t } = useTranslation();

  return (
    <div className='mb-16px flex items-start justify-between gap-12px flex-wrap'>
      <div className='min-w-0'>
        <div className='flex items-center gap-8px flex-wrap'>
          <div className='text-18px font-bold text-t-primary'>
            {t('common.superAssistant.title', { defaultValue: '超级助手' })}
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
              '把团队 Issue、Agent、技能、运行时与现有企业模块连接到同一个协作中枢。',
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
      </div>

      <div className='flex items-center gap-8px'>
        <Button size='small' type='outline' onClick={onOpenOverview}>
          {t('common.superAssistant.headerOverview', { defaultValue: '查看总览' })}
        </Button>
        <Button size='small' type='primary' onClick={onOpenIssues}>
          {t('common.superAssistant.headerWork', { defaultValue: '进入作战台' })}
        </Button>
      </div>
    </div>
  );
};

export default SuperAssistantHeader;
