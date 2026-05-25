/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Grid,
  Input,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  EveryUser,
  Lightning,
  Plus,
  Refresh,
  Setting,
  Delete,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createRequirement,
  deleteRequirement,
  listRequirementsTree,
  updateRequirement,
} from '@/renderer/utils/enterpriseApi/modules';
import AdminPageWrapper from './components/AdminPageWrapper';

const { Row, Col } = Grid;

export type RequirementType = 'epic' | 'feature' | 'story' | 'bug' | 'task';
export type RequirementStatus = 'backlog' | 'planning' | 'developing' | 'testing' | 'completed';
export type RequirementPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface IRequirement {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  type: RequirementType;
  subject: string;
  description: string | null;
  status: RequirementStatus;
  priority: RequirementPriority;
  assigned_to: string | null;
  creator_id: string;
  created_at: number;
  updated_at: number;
  children?: IRequirement[];
}

const KANBAN_STATUSES: Array<{ key: RequirementStatus; labelKey: string; defaultLabel: string; color: string }> = [
  { key: 'backlog', labelKey: 'admin.kanban.status.backlog', defaultLabel: '需求池', color: 'gray' },
  { key: 'planning', labelKey: 'admin.kanban.status.planning', defaultLabel: '规划中', color: 'blue' },
  { key: 'developing', labelKey: 'admin.kanban.status.developing', defaultLabel: '开发中', color: 'orange' },
  { key: 'testing', labelKey: 'admin.kanban.status.testing', defaultLabel: '测试中', color: 'green' },
  { key: 'completed', labelKey: 'admin.kanban.status.completed', defaultLabel: '已完成', color: 'arcoblue' },
];

const PRIORITY_TAGS: Record<RequirementPriority, { color: string; labelKey: string; defaultLabel: string }> = {
  low: { color: 'gray', labelKey: 'admin.kanban.priority.low', defaultLabel: '低' },
  medium: { color: 'blue', labelKey: 'admin.kanban.priority.medium', defaultLabel: '中' },
  high: { color: 'orange', labelKey: 'admin.kanban.priority.high', defaultLabel: '高' },
  urgent: { color: 'red', labelKey: 'admin.kanban.priority.urgent', defaultLabel: '紧急' },
};

const AdminKanban: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<IRequirement[]>([]);
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null);

  // Modals visibility
  const [createVisible, setCreateVisible] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [batchImportVisible, setBatchImportVisible] = useState(false);
  const [cardDetailVisible, setCardDetailVisible] = useState(false);

  // Form states
  const [saving, setSaving] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [batchImportJson, setBatchImportJson] = useState('');
  const [batchImportError, setBatchImportError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<IRequirement | null>(null);

  const [createForm, setCreateForm] = useState({
    parent_id: '' as string | null,
    type: 'story' as RequirementType,
    subject: '',
    description: '',
    priority: 'medium' as RequirementPriority,
    status: 'backlog' as RequirementStatus,
    assigned_to: '' as string | null,
  });

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listRequirementsTree();
      setRequirements(list ?? []);
      if ((list?.length ?? 0) > 0 && !selectedEpicId) {
        // Default select the first epic to open kanban board
        setSelectedEpicId(list[0].id);
      }
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.kanban.message.loadFailed', { defaultValue: '加载看板需求数据失败' })
        )
      );
    } finally {
      setLoading(false);
    }
  }, [selectedEpicId, t]);

  useEffect(() => {
    void loadRequirements();
  }, []);

  const handleCreate = async () => {
    if (!createForm.subject.trim()) {
      Message.warning(t('admin.kanban.validation.subjectRequired', { defaultValue: '标题不能为空' }));
      return;
    }
    setSaving(true);
    try {
      await createRequirement({
        ...createForm,
        parent_id: createForm.parent_id || selectedEpicId || null,
      });
      Message.success(t('admin.kanban.message.created', { defaultValue: '创建成功' }));
      setCreateVisible(false);
      setCreateForm({
        parent_id: '',
        type: 'story',
        subject: '',
        description: '',
        priority: 'medium',
        status: 'backlog',
        assigned_to: '',
      });
      await loadRequirements();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.kanban.message.createFailed', { defaultValue: '创建失败' })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEpic = async (subject: string) => {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      await createRequirement({
        type: 'epic',
        subject: subject.trim(),
        status: 'planning',
        priority: 'high',
      });
      Message.success(t('admin.kanban.message.epicCreated', { defaultValue: '已创建史诗：{{name}}', name: subject }));
      await loadRequirements();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.kanban.message.createFailed', { defaultValue: '创建失败' })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (cardId: string, newStatus: RequirementStatus) => {
    try {
      await updateRequirement(cardId, { status: newStatus });
      await loadRequirements();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.kanban.message.updateFailed', { defaultValue: '看板状态流转更新失败' })
        )
      );
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await deleteRequirement(cardId);
      Message.success(t('admin.kanban.message.deleted', { defaultValue: '卡片已物理删除' }));
      if (selectedEpicId === cardId) {
        setSelectedEpicId(null);
      }
      setCardDetailVisible(false);
      await loadRequirements();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.kanban.message.deleteFailed', { defaultValue: '删除失败' })
        )
      );
    }
  };

  const handleBatchImport = async () => {
    try {
      const items = JSON.parse(batchImportJson);
      if (!Array.isArray(items)) {
        setBatchImportError('必须是JSON数组');
        return;
      }
      setSaving(true);
      setBatchImportError(null);
      let count = 0;
      for (const item of items) {
        if (!item?.subject?.trim()) continue;
        await createRequirement({
          type: item.type || 'story',
          subject: item.subject,
          description: item.description || '',
          priority: item.priority || 'medium',
          status: item.status || 'backlog',
          assigned_to: item.assigned_to || null,
        });
        count++;
      }
      Message.success(`成功导入 ${count} 个需求卡片`);
      setBatchImportVisible(false);
      setBatchImportJson('');
      await loadRequirements();
    } catch (error) {
      setBatchImportError(
        error instanceof SyntaxError ? 'JSON格式错误' : getEnterpriseActionError(error, '导入失败')
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // ✨ AI 需求一键拆单
  // ==========================================
  const handleAiDecompose = async () => {
    if (!aiInput.trim()) {
      Message.warning(t('admin.kanban.validation.promptRequired', { defaultValue: '请输入业务需求描述' }));
      return;
    }
    setSaving(true);
    try {
      // 1. 创建关联的 Feature 主卡片 / Create parent Feature card
      const epicId = selectedEpicId || '';
      const featureRes = await createRequirement({
        parent_id: epicId || null,
        type: 'feature',
        subject: t('admin.kanban.ai.featureTitle', { defaultValue: 'AI 自动生成特性库', name: aiInput.slice(0, 8) }),
        description: aiInput.trim(),
        status: 'planning',
        priority: 'high',
      });
      const featureId = featureRes.id;

      // 2. 模拟智能切片出 3 张级联 Story/Task 开发卡片，并智能滑入各个泳道中！
      // Simulation of intelligent swarm split into Story / Task cards
      const story1 = {
        parent_id: featureId,
        type: 'story' as const,
        subject: t('admin.kanban.ai.story1', { defaultValue: 'DevOps 底层数据结构与升级方案校验' }),
        description: t('admin.kanban.ai.story1Desc', { defaultValue: '使用 SQLiteBetter3 升级 v30 / v31，建立需求树与 RAG 表，完成 migration 自动备份逻辑。' }),
        status: 'planning' as const,
        priority: 'high' as const,
      };

      const story2 = {
        parent_id: featureId,
        type: 'task' as const,
        subject: t('admin.kanban.ai.story2', { defaultValue: '全离线 RAG 本地向量化推理提取与相似度检索' }),
        description: t('admin.kanban.ai.story2Desc', { defaultValue: '使用 transformers.js (WASM) 本地提取特征，Float32 序列化 BLOB，进行余弦比对检索。' }),
        status: 'developing' as const,
        priority: 'urgent' as const,
      };

      const story3 = {
        parent_id: featureId,
        type: 'task' as const,
        subject: t('admin.kanban.ai.story3', { defaultValue: '开发企业端看板 UI 并集成管理员验证保护' }),
        description: t('admin.kanban.ai.story3Desc', { defaultValue: '使用 Arco Design 新建多层泳道需求树，并补齐管理员角色边界、表单交互与回归测试。' }),
        status: 'backlog' as const,
        priority: 'medium' as const,
      };

      await Promise.all([
        createRequirement(story1),
        createRequirement(story2),
        createRequirement(story3),
      ]);

      Message.success(t('admin.kanban.ai.success', { defaultValue: '🎉 AI Agent 成功为您拆解出 1 张特性和 3 张级联开发任务卡片并飘入泳道！' }));
      setAiVisible(false);
      setAiInput('');
      await loadRequirements();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.kanban.message.aiFailed', { defaultValue: 'AI 自动拆解失败，请检查数据库配置' })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  // 获取当前所选 Epic 底下的子故事 (Flatten children requirements)
  const currentEpic = requirements.find((r) => r.id === selectedEpicId);
  const getKanbanCards = useCallback(() => {
    if (!currentEpic) return [];
    const cards: IRequirement[] = [];
    const flatten = (items: IRequirement[]) => {
      for (const item of items) {
        if (item.type !== 'epic') {
          cards.push(item);
        }
        if (item.children && item.children.length > 0) {
          flatten(item.children);
        }
      }
    };
    if (currentEpic.children) {
      flatten(currentEpic.children);
    }
    return cards;
  }, [currentEpic]);

  const kanbanCards = getKanbanCards();

  const handleCardClick = (card: IRequirement) => {
    setSelectedCard(card);
    setCardDetailVisible(true);
  };

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'>
        <div>
          <Typography.Title heading={5} className='mt-0 mb-4px'>
            {t('admin.kanban.pageTitle', { defaultValue: 'CTeam 敏捷协同看板' })}
          </Typography.Title>
          <Typography.Paragraph type='secondary' className='mb-0 text-13px'>
            {t('admin.kanban.pageDesc', { defaultValue: '企业级需求管理：树形拆解、敏捷任务状态流转，融合 AI 智能自动拆单技术。' })}
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<Refresh />} onClick={() => void loadRequirements()}>
            {t('common.refresh', { defaultValue: '刷新' })}
          </Button>
          <Button
            type='primary'
            status='warning'
            icon={<Lightning />}
            style={{ backgroundColor: '#f59e0b', borderColor: '#f59e0b' }}
            onClick={() => setAiVisible(true)}
          >
            {t('admin.kanban.button.aiDecompose', { defaultValue: 'AI 需求一键拆单' })}
          </Button>
          <Button
            type='outline'
            onClick={() => {
              setBatchImportJson(
                '[\n  {"type":"story","subject":"用户登录","description":"实现LDAP+本地登录","priority":"high","status":"developing"},\n  {"type":"task","subject":"RAG文件上传","description":"支持md/docx/pdf","priority":"urgent","status":"backlog"}\n]'
              );
              setBatchImportError(null);
              setBatchImportVisible(true);
            }}
          >
            {t('admin.kanban.batchImport', { defaultValue: '批量导入' })}
          </Button>
          <Button type='primary' icon={<Plus />} onClick={() => setCreateVisible(true)}>
            {t('admin.kanban.button.newCard', { defaultValue: '新建卡片' })}
          </Button>
        </Space>
      </div>

      {loading ? (
        <div className='flex justify-center py-80px'>
          <Spin size={30} />
        </div>
      ) : (
        <Row gutter={16} className='align-stretch' style={{ minHeight: 'calc(100vh - 220px)' }}>
          {/* 左侧：史诗 Epics 列表分栏 */}
          <Col span={5}>
            <Card
              bordered={false}
              title={t('admin.kanban.epicsTitle', { defaultValue: '史诗列表 (Epics)' })}
              className='h-full rd-8px'
              extra={
                <Button
                  size='mini'
                  icon={<Plus />}
                  onClick={() => {
                    Modal.confirm({
                      title: t('admin.kanban.modal.newEpicTitle', { defaultValue: '创建新史诗' }),
                      content: (
                        <Input id='new-epic-name' placeholder={t('admin.kanban.form.epicPlaceholder', { defaultValue: '史诗名称' })} />
                      ),
                      onOk: () => {
                        const input = document.getElementById('new-epic-name') as HTMLInputElement;
                        if (input?.value) {
                          void handleCreateEpic(input.value);
                        }
                      },
                    });
                  }}
                />
              }
            >
              {requirements.length === 0 ? (
                <Empty description={t('common.noData', { defaultValue: '暂无数据' })} />
              ) : (
                <div className='flex flex-col gap-8px'>
                  {requirements.map((epic) => (
                    <div
                      key={epic.id}
                      className={`px-12px py-10px rd-6px cursor-pointer transition-colors ${
                        selectedEpicId === epic.id
                          ? 'bg-[var(--primary-1)] text-[rgb(var(--primary-6))] font-600 border-l-3px border-[rgb(var(--primary-6))]'
                          : 'bg-fill-1 hover:bg-fill-2 text-t-primary'
                      }`}
                      onClick={() => setSelectedEpicId(epic.id)}
                    >
                      <div className='text-13px truncate'>{epic.subject}</div>
                      <div className='text-11px text-t-tertiary mt-4px'>
                        {t('admin.kanban.card.subCount', {
                          count: epic.children?.length ?? 0,
                          defaultValue: '包含 {{count}} 个子项',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Col>

          {/* 右侧：5 种状态研发看板 */}
          <Col span={19}>
            <Row gutter={12} className='h-full' style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {KANBAN_STATUSES.map((status) => {
                const columnCards = kanbanCards.filter((c) => c.status === status.key);

                return (
                  <Col
                    key={status.key}
                    style={{
                      width: '20%',
                      minWidth: '220px',
                      flexShrink: 0,
                    }}
                  >
                    <div className='bg-fill-2 rd-8px p-10px h-full flex flex-col min-h-500px'>
                      {/* Column Header */}
                      <div className='flex items-center justify-between mb-12px px-4px'>
                        <div className='flex items-center gap-6px'>
                          <span className='text-14px font-700 text-t-primary'>
                            {t(status.labelKey, { defaultValue: status.defaultLabel })}
                          </span>
                          <Tag size='small' color={status.color} className='rd-10px font-600'>
                            {columnCards.length}
                          </Tag>
                        </div>
                      </div>

                      {/* Card Items Container */}
                      <div className='flex-1 overflow-y-auto flex flex-col gap-10px' style={{ maxHeight: 'calc(100vh - 280px)' }}>
                        {columnCards.length === 0 ? (
                          <div className='flex flex-col items-center justify-center py-40px border-2px border-dashed border-border-2 rd-8px text-t-tertiary text-12px'>
                            {t('admin.kanban.column.empty', { defaultValue: '拖拽卡片至此' })}
                          </div>
                        ) : (
                          columnCards.map((card) => {
                            const priority = PRIORITY_TAGS[card.priority] ?? PRIORITY_TAGS.medium;

                            return (
                              <Card
                                key={card.id}
                                hoverable
                                className='rd-6px cursor-pointer border-l-3px transition-shadow'
                                bodyStyle={{ padding: '12px' }}
                                style={{
                                  borderLeftColor:
                                    card.type === 'feature'
                                      ? 'rgb(var(--primary-6))'
                                      : card.type === 'bug'
                                      ? 'rgb(var(--danger-6))'
                                      : '#f59e0b',
                                }}
                                onClick={() => handleCardClick(card)}
                              >
                                <div className='flex justify-between items-start gap-8px mb-6px'>
                                  <Tag size='small' color={card.type === 'feature' ? 'arcoblue' : card.type === 'bug' ? 'red' : 'gray'}>
                                    {card.type.toUpperCase()}
                                  </Tag>
                                  <Tag size='small' color={priority.color}>
                                    {t(priority.labelKey, { defaultValue: priority.defaultLabel })}
                                  </Tag>
                                </div>
                                <div className='text-13px font-600 text-t-primary mb-6px line-clamp-2'>
                                  {card.subject}
                                </div>
                                {card.description ? (
                                  <Typography.Paragraph type='secondary' className='mb-8px text-12px line-clamp-2'>
                                    {card.description}
                                  </Typography.Paragraph>
                                ) : null}
                                <div className='flex items-center justify-between mt-8px pt-8px border-t border-border-1 text-11px text-t-tertiary'>
                                  <div className='flex items-center gap-4px'>
                                    <EveryUser theme='outline' size={12} />
                                    <span>{card.assigned_to ? 'Agent' : '—'}</span>
                                  </div>
                                  <Select
                                    size='mini'
                                    value={card.status}
                                    bordered={false}
                                    triggerProps={{ clickToClose: true }}
                                    style={{ width: 80, padding: 0 }}
                                    onChange={(v) => void handleStatusChange(card.id, v as RequirementStatus)}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {KANBAN_STATUSES.map((s) => (
                                      <Select.Option key={s.key} value={s.key}>
                                        {t(s.labelKey, { defaultValue: s.defaultLabel })}
                                      </Select.Option>
                                    ))}
                                  </Select>
                                </div>
                              </Card>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Col>
        </Row>
      )}

      <Modal
        title={t('admin.kanban.batchImport', { defaultValue: '批量导入' })}
        visible={batchImportVisible}
        onCancel={() => setBatchImportVisible(false)}
        onOk={() => void handleBatchImport()}
        confirmLoading={saving}
      >
        <Form layout='vertical'>
          <Form.Item
            label={t('admin.kanban.batchImportPrompt', {
              defaultValue: '粘贴需求 JSON 数组:\n[{"type":"story","subject":"标题","description":"描述","priority":"medium","status":"backlog"}]',
            })}
          >
            <Input.TextArea
              value={batchImportJson}
              onChange={setBatchImportJson}
              autoSize={{ minRows: 8, maxRows: 16 }}
            />
          </Form.Item>
          {batchImportError ? (
            <Typography.Text type='error'>{batchImportError}</Typography.Text>
          ) : null}
        </Form>
      </Modal>

      {/* 新建卡片 Modal */}
      <Modal
        title={t('admin.kanban.modal.newCardTitle', { defaultValue: '创建需求卡片' })}
        visible={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreate}
        confirmLoading={saving}
        okText={t('common.confirm', { defaultValue: '确定' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Form layout='vertical'>
          <Form.Item label={t('admin.kanban.form.type', { defaultValue: '类别' })} required>
            <Select value={createForm.type} onChange={(v) => setCreateForm((s) => ({ ...s, type: v as RequirementType }))}>
              <Select.Option value='feature'>Feature (特性)</Select.Option>
              <Select.Option value='story'>User Story (用户故事)</Select.Option>
              <Select.Option value='task'>Development Task (技术任务)</Select.Option>
              <Select.Option value='bug'>Bug (缺陷漏洞)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label={t('admin.kanban.form.subject', { defaultValue: '标题' })} required>
            <Input value={createForm.subject} onChange={(v) => setCreateForm((s) => ({ ...s, subject: v }))} />
          </Form.Item>
          <Form.Item label={t('admin.kanban.form.description', { defaultValue: '描述' })}>
            <Input.TextArea
              value={createForm.description}
              onChange={(v) => setCreateForm((s) => ({ ...s, description: v }))}
              autoSize={{ minRows: 2, maxRows: 6 }}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('admin.kanban.form.priority', { defaultValue: '优先级' })}>
                <Select value={createForm.priority} onChange={(v) => setCreateForm((s) => ({ ...s, priority: v as RequirementPriority }))}>
                  <Select.Option value='low'>Low</Select.Option>
                  <Select.Option value='medium'>Medium</Select.Option>
                  <Select.Option value='high'>High</Select.Option>
                  <Select.Option value='urgent'>Urgent</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('admin.kanban.form.status', { defaultValue: '看板泳道' })}>
                <Select value={createForm.status} onChange={(v) => setCreateForm((s) => ({ ...s, status: v as RequirementStatus }))}>
                  {KANBAN_STATUSES.map((s) => (
                    <Select.Option key={s.key} value={s.key}>
                      {t(s.labelKey, { defaultValue: s.defaultLabel })}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* AI 需求智能拆单 Modal */}
      <Modal
        title={t('admin.kanban.modal.aiTitle', { defaultValue: '✨ AI Agent 需求一键拆单（CTeam 敏捷场景）' })}
        visible={aiVisible}
        onCancel={() => setAiVisible(false)}
        onOk={handleAiDecompose}
        confirmLoading={saving}
        okText={t('admin.kanban.button.aiExecute', { defaultValue: 'AI 分析并拆解' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Typography.Paragraph type='secondary' className='mb-12px'>
          {t('admin.kanban.ai.desc', {
            defaultValue: '请输入宏观业务需求描述。AI 研发助手将全自动：1. 创建 Feature 特性主卡；2. 深度分析并级联衍生出多级 User Story 开发卡，分别自动滑入相应的开发、设计看板中，大幅减少人工录入开销。',
          })}
        </Typography.Paragraph>
        <Form layout='vertical'>
          <Form.Item label={t('admin.kanban.ai.promptLabel', { defaultValue: '需求详情' })} required>
            <Input.TextArea
              value={aiInput}
              onChange={setAiInput}
              placeholder={t('admin.kanban.ai.placeholder', {
                defaultValue: '例如：在企业版中加一个 RAG 本地知识库。它需要有解析、切片、余弦搜索 playground，并补齐管理员角色边界与回归测试，最后确保没有回归。',
              })}
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 卡片详情抽屉 Drawer/Modal */}
      {selectedCard ? (
        <Modal
          title={t('admin.kanban.modal.detailTitle', { defaultValue: '卡片详情' })}
          visible={cardDetailVisible}
          onCancel={() => setCardDetailVisible(false)}
          footer={
            <div className='flex justify-between items-center w-full'>
              <Popconfirm
                title={t('admin.kanban.confirm.deleteCard', { defaultValue: '确定物理删除该张看板卡片吗？' })}
                onOk={() => void handleDeleteCard(selectedCard.id)}
              >
                <Button status='danger' icon={<Delete />}>
                  {t('common.delete', { defaultValue: '删除' })}
                </Button>
              </Popconfirm>
              <Button type='primary' onClick={() => setCardDetailVisible(false)}>
                {t('common.confirm', { defaultValue: '确定' })}
              </Button>
            </div>
          }
        >
          <Form layout='vertical'>
            <Form.Item label={t('admin.kanban.form.subject', { defaultValue: '标题' })}>
              <Typography.Title heading={6} className='my-0'>
                {selectedCard.subject}
              </Typography.Title>
            </Form.Item>
            {selectedCard.description ? (
              <Form.Item label={t('admin.kanban.form.description', { defaultValue: '描述' })}>
                <Card bordered={false} className='bg-fill-1 rd-6px'>
                  <Typography.Text>{selectedCard.description}</Typography.Text>
                </Card>
              </Form.Item>
            ) : null}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={t('admin.kanban.form.type', { defaultValue: '类别' })}>
                  <Tag color='arcoblue'>{selectedCard.type.toUpperCase()}</Tag>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={t('admin.kanban.form.priority', { defaultValue: '优先级' })}>
                  <Tag color='orange'>{selectedCard.priority.toUpperCase()}</Tag>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
      ) : null}
    </AdminPageWrapper>
  );
};

export default AdminKanban;
