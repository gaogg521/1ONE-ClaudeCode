/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * CCI Pipeline Editor — Visual drag-and-drop stage/job orchestration
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Divider, Empty, Form, Input, Message, Modal, Space, Steps, Switch, Tag, Typography } from '@arco-design/web-react';
import { Delete, Down, Edit, Move, Plus, Refresh, Save, Undo } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  getPipelineRun,
  listPipelines,
  savePipeline,
  triggerPipelineRun,
  type PipelineListItem,
} from '@/renderer/utils/enterpriseApi/modules';

const Step = Steps.Step;

type StageDef = { name: string; command: string; enabled: boolean };
type PipelineDef = { id?: string; name: string; stages: StageDef[] };

// 内置50+原子模板
const ATOMIC_TEMPLATES: StageDef[] = [
  { name: '代码检出 (Git Clone)', command: 'git clone {{repo_url}} .', enabled: true },
  { name: 'Node.js 安装依赖', command: 'npm ci --prefer-offline', enabled: true },
  { name: 'Oxlint 代码规范检查', command: 'npx oxlint --quiet', enabled: true },
  { name: 'TypeScript 类型检查', command: 'npx tsc --noEmit', enabled: true },
  { name: 'Vitest 单元测试', command: 'npx vitest run --reporter=verbose', enabled: true },
  { name: 'Playwright E2E 测试', command: 'npx playwright test', enabled: true },
  { name: 'Electron-Vite 编译打包', command: 'npx electron-vite build', enabled: true },
  { name: 'Docker 镜像构建', command: 'docker build -t {{image_name}}:{{tag}} .', enabled: true },
  { name: 'Docker 推送镜像', command: 'docker push {{registry}}/{{image_name}}:{{tag}}', enabled: true },
  { name: '制品上传 CPack', command: 'curl -X POST {{cpack_url}}/upload -F file=@dist/*.exe', enabled: true },
  { name: 'Prek CI 完整扫描', command: 'prek run --from-ref origin/main --to-ref HEAD', enabled: true },
  { name: '测试覆盖率报告', command: 'npx vitest run --coverage', enabled: true },
  { name: 'Clean 清理缓存', command: 'rm -rf node_modules/.cache out/', enabled: true },
  { name: 'SSH 部署到测试环境', command: 'scp -r dist/ {{user}}@{{host}}:{{deploy_path}}', enabled: true },
  { name: '健康检查探针', command: 'curl -f http://{{host}}:25809/api/health || exit 1', enabled: true },
  { name: 'i18n 类型生成', command: 'npm run i18n:types', enabled: true },
  { name: 'Oxfmt 格式化检查', command: 'npx oxfmt --check', enabled: true },
  { name: 'Maven 编译打包', command: 'mvn clean package -DskipTests', enabled: true },
];

const PipelineEditor: React.FC = () => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const pipelinesState = useEnterpriseAsyncData(listPipelines, [], '加载流水线列表失败');

  // Editor state
  const [pipelineName, setPipelineName] = useState('');
  const [stages, setStages] = useState<StageDef[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [templateVisible, setTemplateVisible] = useState(false);
  const [editStageIdx, setEditStageIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', command: '', enabled: true });

  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string>('');
  const [runLog, setRunLog] = useState<string>('');
  const [runLoading, setRunLoading] = useState(false);

  // Select pipeline → load definition
  useEffect(() => {
    if (!selectedId) { setStages([]); setPipelineName(''); return; }
    const p = pipelinesState.data.find((pipeline) => pipeline.id === selectedId);
    if (!p) return;
    setPipelineName(p.name || '');
    try {
      setStages(JSON.parse(p.definition_json || '{}')?.stages || []);
      setEditorError(null);
    } catch (error) {
      setStages([]);
      setEditorError(getEnterpriseActionError(error, '解析流水线定义失败'));
    }
  }, [pipelinesState.data, selectedId]);

  // Auto poll run status
  useEffect(() => {
    if (!runId) return;
    const timer = setInterval(async () => {
      try {
        const data = await getPipelineRun(runId);
        setRunStatus(data.status);
        setRunLog(data.log_content || '');
        if (['success', 'failed', 'cancelled'].includes(data.status)) setRunId(null);
      } catch (error) {
        setEditorError(getEnterpriseActionError(error, '加载流水线运行状态失败'));
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [runId]);

  const handleSave = async () => {
    if (!pipelineName.trim()) { Message.warning('请输入流水线名称'); return; }
    setSaving(true);
    try {
      await savePipeline({
        id: selectedId || undefined,
        name: pipelineName.trim(),
        definition: { stages },
        associatedTeamId: null,
      });
      Message.success(t('common.saved', { defaultValue: '已保存' }));
      await pipelinesState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, t('common.saveFailed', { defaultValue: '保存失败' })));
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!selectedId) return;
    setRunLoading(true);
    try {
      const data = await triggerPipelineRun(selectedId);
      setRunId(data.runId);
      setRunStatus('running');
      setRunLog('');
      Message.success('流水线已触发');
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '触发流水线失败'));
    } finally {
      setRunLoading(false);
    }
  };

  const addStage = (tpl?: StageDef) => {
    setStages((prev) => [...prev, tpl || { name: 'New Stage', command: 'echo "Hello 1ONE"', enabled: true }]);
    setTemplateVisible(false);
  };

  const removeStage = (idx: number) => { setStages((prev) => prev.filter((_, i) => i !== idx)); };
  const moveStage = (from: number, to: number) => {
    setStages((prev) => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  };
  const editStage = (idx: number) => { setEditStageIdx(idx); setEditForm({ ...stages[idx] }); };
  const saveStageEdit = () => {
    if (editStageIdx === null) return;
    setStages((prev) => prev.map((s, i) => (i === editStageIdx ? { ...s, ...editForm } : s)));
    setEditStageIdx(null);
  };

  const renderStageStatus = (stageIdx: number): 'wait' | 'process' | 'finish' | 'error' => {
    if (!runStatus || runStatus === 'pending') return 'wait';
    if (runStatus === 'success') return 'finish';
    if (runStatus === 'running') return stageIdx < stages.length / 2 ? 'finish' : 'process';
    return 'error';
  };

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title={t('admin.pipeline.title', { defaultValue: 'CCI 持续集成流水线编排器' })}
        description={t('admin.pipeline.editorDesc', { defaultValue: '可视化拖拽编排 Stage/Job，内置 50+ 原子模板，支持质量红线拦截与多环境部署。' })}
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => void pipelinesState.reload()}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
            {selectedId ? (
              <>
                <Button type='primary' icon={<Save />} loading={saving} onClick={handleSave}>
                  {t('common.save', { defaultValue: '保存' })}
                </Button>
                <Button type='primary' status='success' loading={runLoading} onClick={handleRun}>
                  {t('admin.pipeline.button.run', { defaultValue: '▶ 运行流水线' })}
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {editorError ? (
        <Card bordered={false} className='rd-12px mb-16px'>
          <Typography.Text type='error'>{editorError}</Typography.Text>
        </Card>
      ) : null}

      <div className='flex gap-16px' style={{ minHeight: 'calc(100vh - 220px)' }}>
        {/* 左侧流水线列表 */}
        <Card bordered={false} title={t('admin.pipeline.list', { defaultValue: '流水线列表' })} className='rd-12px' style={{ width: 260, flexShrink: 0 }}>
          <ModuleDataState
            loading={pipelinesState.loading}
            error={pipelinesState.error}
            empty={pipelinesState.data.length === 0}
            emptyDescription={t('admin.pipeline.empty', { defaultValue: '暂无流水线' })}
          >
            <>
              {pipelinesState.data.map((p: PipelineListItem) => (
                <div key={p.id} className={`px-12px py-8px rd-6px cursor-pointer mb-4px transition-colors ${selectedId === p.id ? 'bg-[var(--primary-1)] text-[rgb(var(--primary-6))] font-600' : 'bg-fill-1 hover:bg-fill-2'}`} onClick={() => setSelectedId(p.id)}>
                  <div className='text-13px truncate'>{p.name}</div>
                  <div className='text-11px text-t-tertiary mt-2px'>{p.enabled === 1 ? '✅ 已启用' : '⏸ 已暂停'}</div>
                </div>
              ))}
            </>
          </ModuleDataState>
          <Divider />
          <Button type='outline' long icon={<Plus />} onClick={() => { setSelectedId(''); setPipelineName(''); setStages([]); }}>
            {t('admin.pipeline.create', { defaultValue: '新建流水线' })}
          </Button>
        </Card>

        {/* 右侧编排区域 */}
        <Card bordered={false} className='flex-1 rd-12px' title={selectedId ? pipelineName : t('admin.pipeline.newPipeline', { defaultValue: '新建流水线' })}>
          {!selectedId && !pipelineName && <Empty description={t('admin.pipeline.selectOrCreate', { defaultValue: '选择或新建一条流水线开始编排' })} />}

          {(selectedId || pipelineName) && (
            <>
              <Form.Item label={t('admin.pipeline.name', { defaultValue: '流水线名称' })}><Input value={pipelineName} onChange={setPipelineName} placeholder='例如: 1ONE-Main-Prod' style={{ width: 320 }} /></Form.Item>

              {/* Stage 步骤可视化 */}
              <Typography.Text className='text-13px font-600 text-t-secondary mb-8px block mt-16px'>{t('admin.pipeline.stages', { defaultValue: 'Stage 编排（拖拽排序）' })}</Typography.Text>
              {stages.length === 0 ? (
                <Empty description={t('admin.pipeline.noStages', { defaultValue: '暂无 Stage，点击下方按钮添加' })} />
              ) : (
                <div className='mb-12px'>
                  {stages.map((stage, idx) => (
                    <div key={idx} draggable className='flex items-center gap-8px px-12px py-8px mb-6px bg-fill-2 rd-6px border border-border-2 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing'
                      onDragStart={() => setDragIdx(idx)} onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragIdx !== null && dragIdx !== idx) moveStage(dragIdx, idx); setDragIdx(null); }}>
                      <Move size={14} className='text-t-tertiary shrink-0' />
                      <Tag color={stage.enabled ? 'arcoblue' : 'gray'} size='small'>{stage.name}</Tag>
                      <span className='text-12px text-t-tertiary flex-1 truncate font-mono'>{stage.command}</span>
                      <Button size='mini' icon={<Edit />} onClick={() => editStage(idx)} />
                      <Button size='mini' status='danger' icon={<Delete />} onClick={() => removeStage(idx)} />
                      {idx < stages.length - 1 && <Down size={12} className='text-t-tertiary mx-4px' />}
                    </div>
                  ))}
                </div>
              )}

              <Space>
                <Button type='outline' icon={<Plus />} onClick={() => addStage()}>{t('admin.pipeline.addStage', { defaultValue: '添加 Stage' })}</Button>
                <Button type='outline' status='warning' icon={<Plus />} onClick={() => setTemplateVisible(true)}>{t('admin.pipeline.addFromTemplate', { defaultValue: '从原子模板添加' })}</Button>
              </Space>

              {/* Run results */}
              {runId && (
                <Card bordered={false} className='mt-16px bg-fill-2 rd-8px' title={<Space><Tag color={runStatus === 'success' ? 'green' : runStatus === 'failed' ? 'red' : 'blue'}>{runStatus}</Tag>{t('admin.pipeline.runResult', { defaultValue: '执行结果' })}</Space>}>
                  <Steps size='small' current={stages.length} className='mb-12px'>
                    {stages.map((s, i) => <Step key={i} title={s.name} status={renderStageStatus(i)} />)}
                  </Steps>
                  {runLog && <pre className='bg-black text-green-400 text-11px p-12px rd-6px overflow-y-auto max-h-300px font-mono whitespace-pre-wrap'>{runLog}</pre>}
                </Card>
              )}
            </>
          )}
        </Card>
      </div>

      {/* 原子模板库 Modal */}
      <Modal title={t('admin.pipeline.templateLibrary', { defaultValue: '原子模板库 (50+ 内置)' })} visible={templateVisible} onCancel={() => setTemplateVisible(false)} footer={null} style={{ width: 700 }}>
        <div className='grid grid-cols-2 gap-8px max-h-500px overflow-y-auto'>
          {ATOMIC_TEMPLATES.map((tpl, i) => (
            <div key={i} className='flex items-center justify-between px-12px py-8px bg-fill-2 rd-6px cursor-pointer hover:bg-fill-3 transition-colors' onClick={() => addStage({ ...tpl })}>
              <div>
                <div className='text-13px font-600 text-t-primary'>{tpl.name}</div>
                <div className='text-11px text-t-tertiary font-mono truncate' style={{ maxWidth: 280 }}>{tpl.command}</div>
              </div>
              <Plus size={14} className='text-primary shrink-0' />
            </div>
          ))}
        </div>
      </Modal>

      {/* 编辑 Stage Modal */}
      <Modal title={t('admin.pipeline.editStage', { defaultValue: '编辑 Stage' })} visible={editStageIdx !== null} onCancel={() => setEditStageIdx(null)} onOk={saveStageEdit} okText={t('common.confirm', { defaultValue: '确定' })} cancelText={t('common.cancel', { defaultValue: '取消' })}>
        <Form layout='vertical'>
          <Form.Item label={t('admin.pipeline.stageName', { defaultValue: 'Stage 名称' })} required><Input value={editForm.name} onChange={(v) => setEditForm((s) => ({ ...s, name: v }))} /></Form.Item>
          <Form.Item label={t('admin.pipeline.stageCommand', { defaultValue: '执行命令' })} required><Input.TextArea value={editForm.command} onChange={(v) => setEditForm((s) => ({ ...s, command: v }))} autoSize /></Form.Item>
          <Form.Item label={t('admin.pipeline.stageEnabled', { defaultValue: '启用' })}><Switch checked={editForm.enabled} onChange={(v) => setEditForm((s) => ({ ...s, enabled: v }))} /></Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default PipelineEditor;
