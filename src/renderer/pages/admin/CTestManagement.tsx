/**
 * CTest Test Management
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Form, Input, Message, Modal, Select, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { Delete, Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';

type TestPlan = { id: string; name: string; description: string; linked_requirement_id: string; status: string };
type TestCase = { id: string; plan_id: string; subject: string; steps: string; expected: string; status: string; assigned_to: string };

async function api<T>(path: string, opts?: RequestInit): Promise<T> { return fetchWebuiApiJson<T>(path, opts); }
async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withCsrfToken(payload)) });
}

const CTestManagement: React.FC = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<TestPlan | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [caseModalVisible, setCaseModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', linked_requirement_id: '' });
  const [caseForm, setCaseForm] = useState({ subject: '', steps: '', expected: '', assigned_to: '' });
  const [saving, setSaving] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try { const res = await api<{ success: boolean; data: TestPlan[] }>('/api/admin/test-plans'); if (res?.success) setPlans(res.data ?? []); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  const loadCases = useCallback(async (planId: string) => {
    try { const res = await api<{ success: boolean; data: TestCase[] }>(`/api/admin/test-cases?planId=${planId}`); if (res?.success) setCases(res.data ?? []); }
    catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const handleCreatePlan = async () => {
    if (!form.name.trim()) { Message.warning('名称不能为空'); return; }
    setSaving(true);
    try { await apiMutate('/api/admin/test-plans', 'POST', form); Message.success('已创建'); setModalVisible(false); setForm({ name: '', description: '', linked_requirement_id: '' }); await loadPlans(); }
    catch { Message.error('创建失败'); } finally { setSaving(false); }
  };

  const handleCreateCase = async () => {
    if (!selectedPlan || !caseForm.subject.trim()) { Message.warning('标题不能为空'); return; }
    setSaving(true);
    try { await apiMutate('/api/admin/test-cases', 'POST', { ...caseForm, plan_id: selectedPlan.id }); Message.success('已添加用例'); setCaseModalVisible(false); setCaseForm({ subject: '', steps: '', expected: '', assigned_to: '' }); await loadCases(selectedPlan.id); }
    catch { Message.error('添加失败'); } finally { setSaving(false); }
  };

  const planColumns = [
    { title: '名称', dataIndex: 'name' },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'gray'}>{v}</Tag> },
    { title: '操作', render: (_: unknown, r: TestPlan) => <Button size='mini' onClick={() => { setSelectedPlan(r); void loadCases(r.id); }}>管理用例</Button> },
  ];

  const caseColumns = [
    { title: '标题', dataIndex: 'subject' },
    { title: '步骤', dataIndex: 'steps', render: (v: string) => <span className='text-12px text-t-secondary line-clamp-2' style={{ maxWidth: 200 }}>{v || '—'}</span> },
    { title: '预期', dataIndex: 'expected', render: (v: string) => <span className='text-12px text-t-secondary'>{v || '—'}</span> },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'passed' ? 'green' : v === 'failed' ? 'red' : 'orange'}>{v || 'pending'}</Tag> },
  ];

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'><div><Typography.Title heading={5} className='mt-0 mb-4px'>CTest 测试管理</Typography.Title><Typography.Paragraph type='secondary' className='mb-0 text-13px'>测试计划、用例编写与持续测试</Typography.Paragraph></div>
        <Space><Button icon={<Refresh />} onClick={() => void loadPlans()}>刷新</Button><Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>新建测试计划</Button></Space>
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <Card bordered={false} className='rd-12px' title='测试计划'>
          {plans.length === 0 ? <Empty description='暂无计划' /> : <Table loading={loading} data={plans} rowKey='id' columns={planColumns} pagination={false} size='small' border={false} />}
        </Card>
        <Card bordered={false} className='rd-12px' title={selectedPlan ? `用例: ${selectedPlan.name}` : '测试用例'} extra={selectedPlan ? <Button size='mini' icon={<Plus />} onClick={() => setCaseModalVisible(true)}>添加用例</Button> : null}>
          {!selectedPlan ? <Empty description='选择左侧测试计划' /> : cases.length === 0 ? <Empty description='暂无用例' /> : <Table data={cases} rowKey='id' columns={caseColumns} pagination={false} size='small' border={false} />}
        </Card>
      </div>
      <Modal title='新建测试计划' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreatePlan} confirmLoading={saving} okText='创建' cancelText='取消'>
        <Form layout='vertical'><Form.Item label='名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} /></Form.Item><Form.Item label='描述'><Input.TextArea value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} /></Form.Item><Form.Item label='关联需求 ID'><Input value={form.linked_requirement_id} onChange={(v) => setForm((s) => ({ ...s, linked_requirement_id: v }))} /></Form.Item></Form>
      </Modal>
      <Modal title='添加测试用例' visible={caseModalVisible} onCancel={() => setCaseModalVisible(false)} onOk={handleCreateCase} confirmLoading={saving} okText='添加' cancelText='取消'>
        <Form layout='vertical'><Form.Item label='标题' required><Input value={caseForm.subject} onChange={(v) => setCaseForm((s) => ({ ...s, subject: v }))} /></Form.Item><Form.Item label='测试步骤'><Input.TextArea value={caseForm.steps} onChange={(v) => setCaseForm((s) => ({ ...s, steps: v }))} /></Form.Item><Form.Item label='预期结果'><Input value={caseForm.expected} onChange={(v) => setCaseForm((s) => ({ ...s, expected: v }))} /></Form.Item></Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default CTestManagement;
