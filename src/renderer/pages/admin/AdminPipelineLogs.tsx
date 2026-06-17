/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Message, Select, Space, Steps, Tag, Typography } from '@arco-design/web-react';
import { Play, Refresh, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  getPipelineRun,
  listPipelines,
  triggerPipelineRun,
  type PipelineListItem as IPipeline,
  type PipelineRunRecord,
} from '@/renderer/utils/enterpriseApi/modules';
import AdminPageWrapper from './components/AdminPageWrapper';
import ModuleDataState from './components/ModuleDataState';
import ModulePageHeader from './components/ModulePageHeader';

type IPipelineRun = PipelineRunRecord & {
  id: string;
  pipeline_id: string;
  duration_ms: number;
  created_at: number;
  finished_at: number | null;
};

const AdminPipelineLogs: React.FC = () => {
  const { t } = useTranslation();
  const pipelinesState = useEnterpriseAsyncData(
    listPipelines,
    [],
    t('admin.pipeline.message.loadFailed', { defaultValue: '获取流水线配置失败' })
  );
  const [selectedPipelineId, setSelectedEpicId] = useState<string>('');

  const [activeRun, setActiveRun] = useState<IPipelineRun | null>(null);
  const [triggering, setTriggering] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedPipelineId && pipelinesState.data.length > 0) {
      setSelectedEpicId(pipelinesState.data[0].id);
    }
  }, [pipelinesState.data, selectedPipelineId]);

  // 2. 轮询流水线最新执行状态与实时日志 (每 1.5 秒更新)
  useEffect(() => {
    if (
      !activeRun ||
      activeRun.status === 'success' ||
      activeRun.status === 'failed' ||
      activeRun.status === 'cancelled'
    ) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const run = (await getPipelineRun(activeRun.id)) as IPipelineRun;
        setActiveRun(run);
        // 滚动到终端最底部
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch {
        // 静默异常
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [activeRun]);

  // 3. 手动触发流水线执行
  const handleTriggerRun = async () => {
    if (!selectedPipelineId) return;
    setTriggering(true);
    try {
      const res = await triggerPipelineRun(selectedPipelineId);
      Message.success(t('admin.pipeline.message.triggered', { defaultValue: '流水线已成功触发编译构建' }));
      // 设置当前活跃的运行 Run，开始执行定时轮询
      setActiveRun({
        id: res.runId,
        pipeline_id: selectedPipelineId,
        status: 'pending',
        stages_status_json: null,
        log_content: t('admin.pipeline.message.starting', { defaultValue: '正在初始化流水线环境...\n' }),
        duration_ms: 0,
        created_at: Date.now(),
        finished_at: null,
      });
    } catch (error) {
      Message.error(
        getEnterpriseActionError(error, t('admin.pipeline.message.triggerFailed', { defaultValue: '触发执行失败' }))
      );
    } finally {
      setTriggering(false);
    }
  };

  // 解析并构建可视化 Stages 拓扑步骤进度
  const currentPipeline = pipelinesState.data.find((p) => p.id === selectedPipelineId);
  const stages = (() => {
    if (!currentPipeline) return [];
    try {
      const def = JSON.parse(currentPipeline.definition_json);
      return (def?.stages || []) as Array<{ name: string; command: string }>;
    } catch {
      return [
        { name: 'Oxlint Check', command: 'npm run lint' },
        { name: 'Vitest Unit Tests', command: 'npm run test' },
        { name: 'Electron Build', command: 'npx electron-vite build' },
      ];
    }
  })();

  // 计算每个 Stage 的状态
  const getStageStatus = (index: number) => {
    if (!activeRun) return 'wait';
    if (activeRun.status === 'success') return 'finish';
    if (activeRun.status === 'failed') {
      // 检查具体是哪一个阶段失败了
      try {
        const statuses = JSON.parse(activeRun.stages_status_json || '{}');
        const stageName = stages[index]?.name;
        if (statuses[stageName] === 'failed') return 'error';
        if (statuses[stageName] === 'success') return 'finish';
      } catch {
        return 'error';
      }
      return 'wait';
    }
    if (activeRun.status === 'running' || activeRun.status === 'pending') {
      try {
        const statuses = JSON.parse(activeRun.stages_status_json || '{}');
        const stageName = stages[index]?.name;
        if (statuses[stageName] === 'running') return 'process';
        if (statuses[stageName] === 'success') return 'finish';
        if (statuses[stageName] === 'failed') return 'error';
      } catch {
        return 'process';
      }
      // 还没有轮到的则等待
      return 'wait';
    }
    return 'wait';
  };

  return (
    <AdminPageWrapper>
      <div className='flex flex-col flex-1 size-full min-h-0 bg-1 box-border'>
        <ModulePageHeader
          title={t('admin.pipeline.title', { defaultValue: 'CCI 持续集成流水线' })}
          description={t('admin.pipeline.desc', {
            defaultValue: '国产高性能、强管控的编译构建流水线。自动卡控代码 Lint 规范与质量红线门槛。',
          })}
          actions={
            <>
              <Button size='small' icon={<Refresh />} onClick={() => void pipelinesState.reload()} />
              {pipelinesState.data.length > 0 && (
                <Select
                  size='small'
                  style={{ width: 180 }}
                  value={selectedPipelineId}
                  onChange={(v) => {
                    setSelectedEpicId(String(v));
                    setActiveRun(null);
                  }}
                >
                  {pipelinesState.data.map((p) => (
                    <Select.Option key={p.id} value={p.id}>
                      {p.name}
                    </Select.Option>
                  ))}
                </Select>
              )}
              <Button
                size='small'
                type='primary'
                icon={<Play />}
                loading={triggering}
                disabled={!selectedPipelineId}
                onClick={() => void handleTriggerRun()}
              >
                {t('admin.pipeline.button.run', { defaultValue: '运行' })}
              </Button>
            </>
          }
        />

        <ModuleDataState
          loading={pipelinesState.loading}
          error={pipelinesState.error}
          empty={pipelinesState.data.length === 0}
          emptyDescription={t('admin.pipeline.empty', {
            defaultValue: '未配置任何流水线，请先在管理员控制台中完成流水线注册。',
          })}
        >
          <div className='flex-1 flex flex-col min-h-0 gap-16px'>
            {/* Stage 步骤进度拓扑 */}
            <Card bordered={false} className='bg-fill-2 rd-8px'>
              <Steps
                size='small'
                current={activeRun ? stages.findIndex((_, i) => getStageStatus(i) === 'process') + 1 : 0}
              >
                {stages.map((stage, index) => {
                  const status = getStageStatus(index);
                  return (
                    <Steps.Step
                      key={stage.name}
                      title={stage.name}
                      description={stage.command}
                      status={status as any}
                    />
                  );
                })}
              </Steps>
            </Card>

            {/* 实时流控制台日志终端 */}
            <div className='flex-1 flex flex-col min-h-0 rd-8px overflow-hidden border border-border-2'>
              {/* Console Header */}
              <div className='h-32px px-12px bg-fill-3 flex items-center justify-between shrink-0 border-b border-border-2'>
                <div className='flex items-center gap-6px text-12px font-700 text-t-secondary'>
                  <Robot size='14' />
                  <span>{t('admin.pipeline.consoleTitle', { defaultValue: '持续集成构建控制台日志' })}</span>
                </div>
                {activeRun?.status && (
                  <Tag
                    size='small'
                    color={activeRun.status === 'success' ? 'green' : activeRun.status === 'failed' ? 'red' : 'blue'}
                    className='font-600'
                  >
                    {activeRun.status.toUpperCase()}
                  </Tag>
                )}
              </div>

              {/* Terminal Monospace Logs Output */}
              <div className='flex-1 p-12px overflow-y-auto bg-black font-mono text-12px text-green-400 select-text leading-18px whitespace-pre-wrap word-break-break-all'>
                {activeRun?.log_content ? (
                  activeRun.log_content
                ) : (
                  <div className='text-t-tertiary text-center py-40px'>
                    {t('admin.pipeline.consolePlaceholder', {
                      defaultValue: '控制台就绪。点击上方“运行”开始流式监控编译状态...',
                    })}
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>
          </div>
        </ModuleDataState>
      </div>
    </AdminPageWrapper>
  );
};

export default AdminPipelineLogs;
