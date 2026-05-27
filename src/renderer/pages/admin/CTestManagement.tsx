/**
 * CTest Test Management
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Grid, Input, Message, Modal, Select, Space, Table, Tag } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createTestCase,
  createTestPlan,
  listRequirementsTree,
  listTestCases,
  listTestPlans,
  updateTestCase,
  type TestCaseRecord,
  type TestPlan,
} from '@/renderer/utils/enterpriseApi/modules';

const { Row, Col } = Grid;

type FlatRequirement = { id: string; subject: string };

function flattenReqs(items: unknown[]): FlatRequirement[] {
  const result: FlatRequirement[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      const n = node as Record<string, unknown>;
      if (n.type !== 'epic') result.push({ id: String(n.id), subject: String(n.subject) });
      if (Array.isArray(n.children)) walk(n.children as unknown[]);
    }
  };
  walk(items);
  return result;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  pending: { color: 'gray', label: '待执行' },
  passed: { color: 'green', label: '通过' },
  failed: { color: 'red', label: '失败' },
  blocked: { color: 'orange', label: '阻塞' },
};

const CTestManagement: React.FC = () => {
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<TestPlan | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [caseModalVisible, setCaseModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', linked_requirement_id: '' });
  const [caseForm, setCaseForm] = useState({ subject: '', steps: '', expected: '', assigned_to: '' });

  const plansState = useEnterpriseAsyncData(listTestPlans, [], '加载测试计划失败');

  const casesLoader = useCallback(
    () => (selectedPlan ? listTestCases(selectedPlan.id) : Promise.resolve([])),
    [selectedPlan]
  );
  const casesState = useEnterpriseAsyncData<TestCaseRecord[]>(casesLoader, [], '加载测试用例失败');

  // 选中计划变化时自动重新加载用例
  useEffect(() => {
    void casesState.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan?.id]);

  // 需求列表（用于关联下拉）
  const reqsState = useEnterpriseAsyncData(listRequirementsTree, [], '');
  const flatReqs = flattenReqs(reqsState.data as unknown[]);

  const handleCreatePlan = async () => {
    if (!form.name.trim()) { Message.warning('名称不能为空'); return; }
    setSaving(true);
    try {
      await createTestPlan(form);
      Message.success('已创建');
      setModalVisible(false);
      setForm({ name: '', description: '', linked_requirement_id: '' });
      await plansState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '创建测试计划失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCase = async () => {
    if (!selectedPlan || !caseForm.subject.trim()) { Message.warning('标题不能为空'); return; }
    setSaving(true);
    try {
      await createTestCase({ ...caseForm, plan_id: selectedPlan.id });
      Message.success('已添加用例');
      setCaseModalVisible(false);
      setCaseForm({ subject: '', steps: '', expected: '', assigned_to: '' });
      await casesState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '创建用例失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (caseId: string, status: string) => {
    try {
      await updateTestCase(caseId, { status });
      await casesState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '更新状态失败'));
    }
  };

  const caseColumns = [
    {
      title: t('admin.ctest.caseSubject', { defaultValue: '用例标题' }),
      dataIndex: 'subject',
      render: (v: string) => <span className='font-600'>{v}</span>,
    },
    {
      title: t('admin.ctest.caseSteps', { defaultValue: '步骤' }),
      dataIndex: 'steps',
      render: (v: string) => <span className='text-12px text-t-secondary'>{v || '—'}</span>,
    },
    {
      title: t('admin.ctest.caseExpected', { defaultValue: '预期结果' }),
      dataIndex: 'expected',
      render: (v: string) => <span className='text-12px text-t-secondary'>{v || '—'}</span>,
    },
    {
      title: t('admin.ctest.caseStatus', { defaultValue: '状态' }),
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const meta = STATUS_META[v] ?? STATUS_META.pending;
        return <Tag size='small' color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: t('admin.ctest.caseActions', { defaultValue: '执行' }),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: TestCaseRecord) => (
        <Space size={4}>
          <Button
            size='mini'
            type='text'
            status='success'
            disabled={record.status === 'passed'}
            onClick={() => void handleUpdateStatus(record.id, 'passed')}
          >
            {t('admin.ctest.pass', { defaultValue: '通过' })}
          </Button>
          <Button
            size='mini'
            type='text'
            status='danger'
            disabled={record.status === 'failed'}
            onClick={() => void handleUpdateStatus(record.id, 'failed')}
          >
            {t('admin.ctest.fail', { defaultValue: '失败' })}
          </Button>
          <Button
            size='mini'
            type='text'
            disabled={record.status === 'pending'}
            onClick={() => void handleUpdateStatus(record.id, 'pending')}
          >
            {t('admin.ctest.reset', { defaultValue: '重置' })}
          </Button>
        </Space>
      ),
    },
  ];

  const planStats = selectedPlan
    ? {
        total: casesState.data.length,
        passed: casesState.data.filter((c) => c.status === 'passed').length,
        failed: casesState.data.filter((c) => c.status === 'failed').length,
        pending: casesState.data.filter((c) => c.status === 'pending' || !c.status).length,
      }
    : null;

  return (
    <AdminPageWrapper>
      <div className='max-w-1200px mx-auto flex flex-col gap-20px'>
        <ModulePageHeader
          title={t('admin.ctest.title', { defaultValue: '测试管理' })}
          description={t('admin.ctest.desc', { defaultValue: '测试计划、用例管理与执行状态追踪。' })}
          actions={
            <Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>
              {t('admin.ctest.newPlan', { defaultValue: '新建测试计划' })}
            </Button>
          }
        />

        <Row gutter={[16, 16]}>
          {/* 左侧：测试计划列表 */}
          <Col xs={24} md={8}>
            <Card
              bordered={false}
              className='rd-12px h-full'
              title={t('admin.ctest.plans', { defaultValue: '测试计划' })}
              extra={
                <Button size='mini' type='text' icon={<Refresh />} onClick={() => void plansState.reload()}>
                  {t('common.refresh', { defaultValue: '刷新' })}
                </Button>
              }
            >
              <ModuleDataState
                loading={plansState.loading}
                error={plansState.error}
                empty={plansState.data.length === 0}
                emptyDescription={t('admin.ctest.noPlans', { defaultValue: '暂无测试计划' })}
              >
                <div className='flex flex-col gap-6px'>
                  {plansState.data.map((plan) => (
                    <div
                      key={plan.id}
                      className={[
                        'p-10px rd-8px cursor-pointer border border-solid transition-all',
                        selectedPlan?.id === plan.id
                          ? 'border-primary bg-primary-light-1'
                          : 'border-[var(--color-border-2)] hover:border-primary hover:bg-fill-2',
                      ].join(' ')}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <div className='font-600 text-13px text-t-primary truncate'>{plan.name}</div>
                      {plan.description && (
                        <div className='text-11px text-t-tertiary mt-2px truncate'>{plan.description}</div>
                      )}
                      <Tag size='small' color={plan.status === 'completed' ? 'green' : 'arcoblue'} className='mt-6px'>
                        {plan.status === 'completed' ? '已完成' : '进行中'}
                      </Tag>
                    </div>
                  ))}
                </div>
              </ModuleDataState>
            </Card>
          </Col>

          {/* 右侧：用例列表 */}
          <Col xs={24} md={16}>
            <Card
              bordered={false}
              className='rd-12px'
              title={
                selectedPlan ? (
                  <div className='flex items-center gap-10px'>
                    <span>{selectedPlan.name}</span>
                    {planStats && (
                      <Space size={6}>
                        <Tag size='small' color='green'>{planStats.passed} 通过</Tag>
                        <Tag size='small' color='red'>{planStats.failed} 失败</Tag>
                        <Tag size='small' color='gray'>{planStats.pending} 待执行</Tag>
                      </Space>
                    )}
                  </div>
                ) : t('admin.ctest.selectPlan', { defaultValue: '请选择测试计划' })
              }
              extra={
                selectedPlan && (
                  <Button size='small' type='outline' icon={<Plus />} onClick={() => setCaseModalVisible(true)}>
                    {t('admin.ctest.addCase', { defaultValue: '添加用例' })}
                  </Button>
                )
              }
            >
              {!selectedPlan ? (
                <div className='text-center text-t-tertiary py-40px text-13px'>
                  {t('admin.ctest.selectPlanHint', { defaultValue: '从左侧选择一个测试计划开始管理用例' })}
                </div>
              ) : (
                <ModuleDataState
                  loading={casesState.loading}
                  error={casesState.error}
                  empty={casesState.data.length === 0}
                  emptyDescription={t('admin.ctest.noCases', { defaultValue: '暂无测试用例，点击「添加用例」开始' })}
                >
                  <Table
                    data={casesState.data}
                    rowKey='id'
                    columns={caseColumns}
                    pagination={{ pageSize: 20, size: 'small' }}
                    size='small'
                    border={false}
                  />
                </ModuleDataState>
              )}
            </Card>
          </Col>
        </Row>

        {/* 新建测试计划 Modal */}
        <Modal
          title={t('admin.ctest.newPlan', { defaultValue: '新建测试计划' })}
          visible={modalVisible}
          onCancel={() => setModalVisible(false)}
          onOk={() => void handleCreatePlan()}
          confirmLoading={saving}
          okText={t('common.create', { defaultValue: '创建' })}
          cancelText={t('common.cancel', { defaultValue: '取消' })}
        >
          <Form layout='vertical'>
            <Form.Item label={t('admin.ctest.planName', { defaultValue: '计划名称' })} required>
              <Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} placeholder='例如：v2.0 回归测试' />
            </Form.Item>
            <Form.Item label={t('admin.ctest.planDesc', { defaultValue: '描述' })}>
              <Input.TextArea value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} autoSize />
            </Form.Item>
            <Form.Item label={t('admin.ctest.linkedReq', { defaultValue: '关联需求（可选）' })}>
              <Select
                value={form.linked_requirement_id || undefined}
                onChange={(v) => setForm((s) => ({ ...s, linked_requirement_id: v as string }))}
                placeholder={t('admin.ctest.selectReq', { defaultValue: '选择关联的需求/Story' })}
                allowClear
                showSearch
                filterOption={(input, option) => {
                  const label = (option as { props?: { children?: unknown } })?.props?.children;
                  return typeof label === 'string' && label.toLowerCase().includes(input.toLowerCase());
                }}
              >
                {flatReqs.map((r) => (
                  <Select.Option key={r.id} value={r.id}>{r.subject}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        </Modal>

        {/* 添加测试用例 Modal */}
        <Modal
          title={t('admin.ctest.addCase', { defaultValue: '添加测试用例' })}
          visible={caseModalVisible}
          onCancel={() => setCaseModalVisible(false)}
          onOk={() => void handleCreateCase()}
          confirmLoading={saving}
          okText={t('common.add', { defaultValue: '添加' })}
          cancelText={t('common.cancel', { defaultValue: '取消' })}
        >
          <Form layout='vertical'>
            <Form.Item label={t('admin.ctest.caseSubject', { defaultValue: '用例标题' })} required>
              <Input value={caseForm.subject} onChange={(v) => setCaseForm((s) => ({ ...s, subject: v }))} placeholder='例如：用户登录成功后跳转首页' />
            </Form.Item>
            <Form.Item label={t('admin.ctest.caseSteps', { defaultValue: '操作步骤' })}>
              <Input.TextArea value={caseForm.steps} onChange={(v) => setCaseForm((s) => ({ ...s, steps: v }))} autoSize placeholder='1. 打开登录页&#10;2. 输入账号密码&#10;3. 点击登录' />
            </Form.Item>
            <Form.Item label={t('admin.ctest.caseExpected', { defaultValue: '预期结果' })}>
              <Input value={caseForm.expected} onChange={(v) => setCaseForm((s) => ({ ...s, expected: v }))} placeholder='跳转到首页，显示欢迎信息' />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </AdminPageWrapper>
  );
};

export default CTestManagement;
