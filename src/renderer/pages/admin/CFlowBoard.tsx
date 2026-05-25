/**
 * CFlow Value Stream Management
 */
import React from 'react';
import { Card, Typography, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import { listValueStreamStages, type FlowStageRecord } from '@/renderer/utils/enterpriseApi/modules';

const STAGES = ['需求分析', '设计规划', '开发编码', '代码评审', '测试验证', '部署发布'];

const CFlowBoard: React.FC = () => {
  const { t } = useTranslation();
  const stagesState = useEnterpriseAsyncData(listValueStreamStages, [], '加载价值流数据失败');

  const formatMs = (ms: number) => {
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}秒`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}分钟`;
    return `${(ms / 3600000).toFixed(1)}小时`;
  };

  // Group by requirement
  const byReq = new Map<string, FlowStageRecord[]>();
  stagesState.data.forEach((s) => {
    const key = s.requirement_id || 'unlinked';
    const arr = byReq.get(key) || [];
    arr.push(s);
    byReq.set(key, arr);
  });

  return (
    <AdminPageWrapper>
      <Typography.Title heading={5} className='mt-0 mb-4px'>{t('admin.cflow.title', { defaultValue: 'CFlow 价值流管理' })}</Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-20px text-13px'>{t('admin.cflow.desc', { defaultValue: '端到端交付可视化。精细度量等待时间与活跃处理时间，精准识别协作瓶颈。' })}</Typography.Paragraph>
      <ModuleDataState
        loading={stagesState.loading}
        error={stagesState.error}
        empty={byReq.size === 0}
        emptyDescription='暂无价值流数据。当 CTeam 需求卡片状态发生流转时，系统将自动打点记录。'
      >
        {Array.from(byReq.entries()).map(([reqId, flowStages]) => (
          <Card key={reqId} bordered={false} className='rd-12px mb-16px' title={<span className='text-14px font-600'>{flowStages[0]?.req_subject || reqId}</span>}>
            <div className='flex items-start gap-8px overflow-x-auto pb-12px'>
              {STAGES.map((stageName, idx) => {
                const found = flowStages.find((s) => s.stage_name === stageName);
                const isBottleneck = found && found.wait_duration_ms > 86400000; // >24h wait = bottleneck
                return (
                  <div key={idx} className='flex flex-col items-center min-w-120px flex-shrink-0'>
                    <div className={`w-full px-12px py-10px rd-8px text-center mb-6px ${found ? (isBottleneck ? 'bg-[rgb(var(--danger-1))] border border-[rgb(var(--danger-6))]' : 'bg-[rgb(var(--primary-1))] border border-[rgb(var(--primary-6))]') : 'bg-fill-2 border border-border-2'}`}>
                      <div className='text-13px font-600 text-t-primary mb-4px'>{stageName}</div>
                      {found ? (
                        <>
                          <div className='text-11px text-t-secondary'>等待: {formatMs(found.wait_duration_ms)}</div>
                          <div className='text-11px text-t-secondary'>处理: {formatMs(found.process_duration_ms)}</div>
                          {isBottleneck && <Tag size='small' color='red' className='mt-4px'>⚠ 瓶颈</Tag>}
                        </>
                      ) : (
                        <div className='text-11px text-t-tertiary'>—</div>
                      )}
                    </div>
                    {idx < STAGES.length - 1 && <div className='text-t-tertiary text-16px mb-6px'>→</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </ModuleDataState>
    </AdminPageWrapper>
  );
};

export default CFlowBoard;
