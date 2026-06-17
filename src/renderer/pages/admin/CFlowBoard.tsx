/**
 * CFlow Value Stream Management
 */
import React from 'react';
import { Badge, Card, Progress, Tag, Tooltip } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import { listValueStreamStages, type FlowStageRecord } from '@/renderer/utils/enterpriseApi/modules';

const STAGE_ORDER = ['需求分析', '设计规划', '开发编码', '代码评审', '测试验证', '部署发布'];

const STAGE_COLORS: Record<string, string> = {
  需求分析: 'arcoblue',
  设计规划: 'purple',
  开发编码: 'blue',
  代码评审: 'orange',
  测试验证: 'gold',
  部署发布: 'green',
};

function formatMs(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

function resolveStageMetrics(record: FlowStageRecord): { waitMs: number; processMs: number } {
  let processMs = record.process_duration_ms ?? 0;
  if (processMs <= 0 && record.exit_time && record.entry_time) {
    processMs = Math.max(0, record.exit_time - record.entry_time);
  }
  let waitMs = record.wait_duration_ms ?? 0;
  // 兼容旧数据：等待时间与处理时间被重复写入同一时长
  if (waitMs > 0 && processMs > 0 && waitMs === processMs) {
    waitMs = 0;
  }
  return { waitMs, processMs };
}

function resolveRequirementTitle(reqId: string, stages: FlowStageRecord[]): string {
  const subject = stages.find((stage) => stage.req_subject)?.req_subject;
  if (subject) return subject;
  if (reqId === 'unlinked') {
    return '未关联需求';
  }
  return reqId.slice(0, 8);
}

const CFlowBoard: React.FC = () => {
  const { t } = useTranslation();
  const stagesState = useEnterpriseAsyncData(listValueStreamStages, [], '加载价值流数据失败');

  // 按需求分组
  const byReq = new Map<string, FlowStageRecord[]>();
  stagesState.data.forEach((s) => {
    const key = s.requirement_id || 'unlinked';
    const arr = byReq.get(key) ?? [];
    arr.push(s);
    byReq.set(key, arr);
  });

  // 全局各阶段平均处理时间（用于瓶颈识别）
  const stageAvgProcess = new Map<string, number>();
  STAGE_ORDER.forEach((stage) => {
    const records = stagesState.data
      .filter((s) => s.stage_name === stage)
      .map((record) => resolveStageMetrics(record))
      .filter((metrics) => metrics.processMs > 0);
    if (records.length > 0) {
      stageAvgProcess.set(stage, records.reduce((sum, metrics) => sum + metrics.processMs, 0) / records.length);
    }
  });
  const maxAvgProcess = Math.max(0, ...Array.from(stageAvgProcess.values()));

  return (
    <AdminPageWrapper>
      <div className='max-w-1400px mx-auto flex flex-col gap-20px'>
        <ModulePageHeader
          title={t('admin.cflow.title', { defaultValue: '价值流' })}
          description={t('admin.cflow.desc', {
            defaultValue:
              '端到端交付可视化。精细度量各阶段等待时间与处理时间，精准识别协作瓶颈。数据由 CTeam 需求状态流转自动打点。',
          })}
        />

        {/* 瓶颈热力图 */}
        {stageAvgProcess.size > 0 && (
          <Card
            bordered={false}
            className='rd-12px'
            title={t('admin.cflow.bottleneck', { defaultValue: '阶段平均处理时间（瓶颈识别）' })}
          >
            <div className='flex gap-12px flex-wrap'>
              {STAGE_ORDER.map((stage) => {
                const avg = stageAvgProcess.get(stage) ?? 0;
                const pct = maxAvgProcess > 0 ? Math.round((avg / maxAvgProcess) * 100) : 0;
                return (
                  <div key={stage} className='flex-1 min-w-120px'>
                    <div className='flex items-center justify-between mb-4px'>
                      <Tag size='small' color={STAGE_COLORS[stage] ?? 'gray'}>
                        {stage}
                      </Tag>
                      <span className='text-11px text-t-secondary font-mono'>{formatMs(avg)}</span>
                    </div>
                    <Progress
                      percent={pct}
                      size='small'
                      color={pct >= 80 ? '#f53f3f' : pct >= 50 ? '#ff7d00' : '#00b42a'}
                      showText={false}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* 需求流转明细 */}
        <ModuleDataState
          loading={stagesState.loading}
          error={stagesState.error}
          empty={byReq.size === 0}
          emptyDescription={t('admin.cflow.empty', {
            defaultValue: '暂无价值流数据。在 CTeam 中推进需求状态后，数据将自动出现在这里。',
          })}
        >
          <div className='flex flex-col gap-12px'>
            {Array.from(byReq.entries()).map(([reqId, flowStages]) => {
              const reqName = resolveRequirementTitle(reqId, flowStages);
              const sortedStages = [...flowStages].toSorted((a, b) => a.entry_time - b.entry_time);
              const completedStageNames = new Set(sortedStages.map((s) => s.stage_name));
              const totalWait = sortedStages.reduce((sum, stage) => sum + resolveStageMetrics(stage).waitMs, 0);
              const totalProcess = sortedStages.reduce((sum, stage) => sum + resolveStageMetrics(stage).processMs, 0);
              const flowEfficiency =
                totalWait + totalProcess > 0 ? Math.round((totalProcess / (totalWait + totalProcess)) * 100) : 0;

              return (
                <Card
                  key={reqId}
                  bordered={false}
                  className='rd-12px'
                  title={
                    <div className='flex items-center gap-10px'>
                      <span className='font-600 text-t-primary'>{reqName}</span>
                      <Tooltip content={`流动效率 = 处理时间 / (等待 + 处理)`}>
                        <Tag
                          size='small'
                          color={flowEfficiency >= 60 ? 'green' : flowEfficiency >= 30 ? 'orange' : 'red'}
                        >
                          流动效率 {flowEfficiency}%
                        </Tag>
                      </Tooltip>
                      <span className='text-11px text-t-tertiary'>
                        总等待 {formatMs(totalWait)} · 总处理 {formatMs(totalProcess)}
                      </span>
                    </div>
                  }
                >
                  {/* 阶段泳道 */}
                  <div className='flex items-center gap-0 overflow-x-auto'>
                    {STAGE_ORDER.map((stage, idx) => {
                      const record = sortedStages.find((s) => s.stage_name === stage);
                      const isCompleted = completedStageNames.has(stage);
                      const isCurrent = isCompleted && !completedStageNames.has(STAGE_ORDER[idx + 1] ?? '');
                      return (
                        <React.Fragment key={stage}>
                          <div
                            className={[
                              'flex flex-col items-center px-12px py-8px rd-8px min-w-100px text-center transition-all',
                              isCompleted ? 'bg-fill-2' : 'opacity-30',
                            ].join(' ')}
                          >
                            <Badge
                              status={isCurrent ? 'processing' : isCompleted ? 'success' : 'default'}
                              dot
                              className='mb-4px'
                            />
                            <Tag size='small' color={isCompleted ? (STAGE_COLORS[stage] ?? 'gray') : 'gray'}>
                              {stage}
                            </Tag>
                            {record &&
                              (() => {
                                const metrics = resolveStageMetrics(record);
                                return (
                                  <div className='mt-4px text-10px text-t-tertiary'>
                                    <div>等待 {formatMs(metrics.waitMs)}</div>
                                    {metrics.processMs > 0 && <div>处理 {formatMs(metrics.processMs)}</div>}
                                  </div>
                                );
                              })()}
                          </div>
                          {idx < STAGE_ORDER.length - 1 && (
                            <div
                              className={[
                                'w-20px h-1px flex-shrink-0',
                                isCompleted && completedStageNames.has(STAGE_ORDER[idx + 1])
                                  ? 'bg-primary'
                                  : 'bg-[var(--color-border-2)]',
                              ].join(' ')}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </ModuleDataState>
      </div>
    </AdminPageWrapper>
  );
};

export default CFlowBoard;
