import React from 'react';
import { Button, Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type SkillsTabProps = {
  skillCount: number;
  skillNames: string[];
  enabledMcpCount: number;
  mcpNames: string[];
  onOpenSkillsHub: () => void;
  onOpenMcp: () => void;
};

const SkillsTab: React.FC<SkillsTabProps> = ({
  skillCount,
  skillNames,
  enabledMcpCount,
  mcpNames,
  onOpenSkillsHub,
  onOpenMcp,
}) => {
  const { t } = useTranslation();

  return (
    <div className='grid gap-12px md:grid-cols-2'>
      <Card title={t('common.superAssistant.skillsCapabilityTitle', { defaultValue: '能力包与复用流程' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.skillsLiveSummary', {
            defaultValue: '已接入 {{count}} 个技能',
            count: skillCount,
          })}
        </div>
        {skillNames.length ? <div className='mt-8px text-12px text-t-secondary'>{skillNames.join(' · ')}</div> : null}
        <div className='mt-12px'>
          <Button size='small' type='primary' onClick={onOpenSkillsHub}>
            {t('common.superAssistant.openSkillsHub', { defaultValue: '打开 Skills' })}
          </Button>
        </div>
      </Card>
      <Card title={t('common.superAssistant.skillsMcpTitle', { defaultValue: 'MCP 与自动化入口' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.mcpLiveSummary', {
            defaultValue: '当前有 {{count}} 个启用中的 MCP 连接器',
            count: enabledMcpCount,
          })}
        </div>
        {mcpNames.length ? <div className='mt-8px text-12px text-t-secondary'>{mcpNames.join(' · ')}</div> : null}
        <div className='mt-12px'>
          <Button size='small' onClick={onOpenMcp}>
            {t('common.superAssistant.openMcpCenter', { defaultValue: '打开 MCP 中心' })}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SkillsTab;
