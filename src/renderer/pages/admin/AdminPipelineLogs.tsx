/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Empty, Message, Select, Space, Spin, Steps, Tag, Typography } from '@arco-design/web-react';
import { Play, Refresh, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  return fetchWebuiApiJson<T>(path, opts);
}

async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken(payload)),
  });
}

export interface IPipeline {
  id: string;
  tenant_id: string;
  name: string;
  definition_json: string; // 存储包含 stages 的定义 JSON
}

export interface IPipelineRun {
  id: string;
  pipeline_id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  stages_status_json: string | null;
  log_content: string | null;
  duration_ms: number;
  created_at: number;
  finished_at: number | null;
}

const AdminPipelineLogs: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<IPipeline[]>([]);
  const [selectedPipelineId, setSelectedEpicId] = useState<string>('');

  const [activeRun, setActiveRun] = useState<IPipelineRun | null>(null);
  const [triggering, setTriggering] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // 1. 获取所有流水线列表
  const loadPipelines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: IPipeline[] }>('/api/admin/pipelines');
      if (res?.success && res.data?.length > 0) {
        setPipelines(res.data);
        setSelectedEpicId(res.data[0].id);
      }
    } catch {
      Message.error(t('admin.pipeline.message.loadFailed', { defaultValue: '获取流水线配置失败' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  // 2. 轮询流水线最新执行状态与实时日志 (每 1.5 秒更新)
  useEffect(() => {
    if (!activeRun || activeRun.status === 'success' || activeRun.status === 'failed' || activeRun.status === 'cancelled') {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await api<{ success: boolean; data: IPipelineRun }>(`/api/admin/pipelines/runs/${activeRun.id}`);
        if (res?.success) {
          setActiveRun(res.data);
          // 滚动到终端最底部
          consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
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
      const res = await apiMutate<{ success: boolean; data: { runId: string } }>(
        `/api/admin/pipelines/run/${selectedPipelineId}`,
        'POST',
        {}
      );
      if (res?.success) {
        Message.success(t('admin.pipeline.message.triggered', { defaultValue: '流水线已成功触发编译构建' }));
        // 设置当前活跃的运行 Run，开始执行定时轮询
        setActiveRun({
          id: res.data.runId,
          pipeline_id: selectedPipelineId,
          status: 'pending',
          stages_status_json: null,
          log_content: t('admin.pipeline.message.starting', { defaultValue: '正在初始化流水线环境...\n' }),
          duration_ms: 0,
          created_at: Date.now(),
          finished_at: null,
        });
      }
    } catch (e: any) {
      Message.error(e.message || t('admin.pipeline.message.triggerFailed', { defaultValue: '触发执行失败' }));
    } finally {
      setTriggering(false);
    }
  };

  // 解析并构建可视化 Stages 拓扑步骤进度
  const currentPipeline = pipelines.find((p) => p.id === selectedPipelineId);
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
    <div className='flex flex-col flex-1 size-full min-h-0 bg-1 p-16px box-border'>
      <div className='flex items-center justify-between mb-16px'>
        <div>
          <Typography.Title heading={5} className='mt-0 mb-4px'>
            {t('admin.pipeline.title', { defaultValue: 'CCI 持续集成流水线' })}
          </Typography.Title>
          <Typography.Paragraph type='secondary' className='mb-0 text-12px'>
            {t('admin.pipeline.desc', { defaultValue: '国产高性能、强管控的编译构建流水线。自动卡控代码 Lint 规范与质量红线门槛。' })}
          </Typography.Paragraph>
        </div>
        <Space>
          <Button size='small' icon={<Refresh />} onClick={() => void loadPipelines()} />
          {pipelines.length > 0 && (
            <Select
              size='small'
              style={{ width: 180 }}
              value={selectedPipelineId}
              onChange={(v) => {
                setSelectedEpicId(v);
                setActiveRun(null);
              }}
            >
              {pipelines.map((p) => (
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
        </Space>
      </div>

      {loading ? (
        <div className='flex-1 flex justify-center items-center py-40px'>
          <Spin />
        </div>
      ) : pipelines.length === 0 ? (
        <div className='flex-1 flex items-center justify-center'>
          <Empty description={t('admin.pipeline.empty', { defaultValue: '未配置任何流水线，请先在管理员控制台中完成流水线注册。' })} />
        </div>
      ) : (
        <div className='flex-1 flex flex-col min-h-0 gap-16px'>
          {/* Stage 步骤进度拓扑 */}
          <Card bordered={false} className='bg-fill-2 rd-8px'>
            <Steps size='small' current={activeRun ? stages.findIndex((_, i) => getStageStatus(i) === 'process') + 1 : 0}>
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
                  color={
                    activeRun.status === 'success'
                      ? 'green'
                      : activeRun.status === 'failed'
                      ? 'red'
                      : 'blue'
                  }
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
                  {t('admin.pipeline.consolePlaceholder', { defaultValue: '控制台就绪。点击上方“运行”开始流式监控编译状态...' })}
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPipelineLogs;
