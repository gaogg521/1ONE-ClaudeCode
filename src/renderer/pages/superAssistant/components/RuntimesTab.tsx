import React from 'react';
import { Button, Card } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type RuntimesTabProps = {
  totalAgentCount: number;
  activeAgentCount: number;
  enabledMcpCount: number;
  onOpenAgentSettings: () => void;
  onOpenModelSettings: () => void;
  onOpenOrgNodes?: () => void;
  showOrgNodesLink?: boolean;
};

const RuntimesTab: React.FC<RuntimesTabProps> = ({
  totalAgentCount,
  activeAgentCount,
  enabledMcpCount,
  onOpenAgentSettings,
  onOpenModelSettings,
  onOpenOrgNodes,
  showOrgNodesLink = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className='space-y-12px'>
      {showOrgNodesLink ? (
        <Card title={t('common.agentFleet.title', { defaultValue: '组织节点' })}>
          <div className='mb-10px text-12px text-t-tertiary'>
            {t('common.agentFleet.desc', {
              defaultValue:
                '查看同组织成员在线的机器名、IP 与已安装 Agent。各端登录组织后会自动上报心跳。',
            })}
          </div>
          <Button size='small' type='outline' onClick={onOpenOrgNodes}>
            {t('common.superAssistant.openOrgNodes', { defaultValue: '打开组织节点' })}
          </Button>
        </Card>
      ) : null}
    <div className='grid gap-12px md:grid-cols-2'>
      <Card title={t('common.superAssistant.runtimesRuntimeTitle', { defaultValue: '运行时与执行环境' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.runtimeLiveSummary', {
            defaultValue: '当前有 {{agentCount}} 个 Agent、{{activeCount}} 个活跃 Agent',
            agentCount: totalAgentCount,
            activeCount: activeAgentCount,
          })}
        </div>
        <div className='mt-12px'>
          <Button size='small' type='primary' onClick={onOpenAgentSettings}>
            {t('common.superAssistant.openAgentSettings', { defaultValue: '打开 Agent 设置' })}
          </Button>
        </div>
      </Card>
      <Card title={t('common.superAssistant.runtimesModelTitle', { defaultValue: '模型与算力配置' })}>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.mcpLiveSummary', {
            defaultValue: '当前有 {{count}} 个启用中的 MCP 连接器',
            count: enabledMcpCount,
          })}
        </div>
        <div className='mt-12px'>
          <Button size='small' onClick={onOpenModelSettings}>
            {t('common.superAssistant.openModelSettings', { defaultValue: '打开模型设置' })}
          </Button>
        </div>
      </Card>
    </div>
    </div>
  );
};

export default RuntimesTab;
