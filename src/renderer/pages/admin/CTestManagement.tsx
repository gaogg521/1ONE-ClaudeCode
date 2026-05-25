/**
 * CTest Test Management
 */
import React, { useCallback, useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Space, Table, Tag } from '@arco-design/web-react';
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
  listTestCases,
  listTestPlans,
  type TestCaseRecord,
  type TestPlan,
} from '@/renderer/utils/enterpriseApi/modules';

const CTestManagement: React.FC = () => {
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<TestPlan | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [caseModalVisible, setCaseModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', linked_requirement_id: '' });
  const [caseForm, setCaseForm] = useState({ subject: '', steps: '', expected: '', assigned_to: '' });
  const [saving, setSaving] = useState(false);
  const plansState = useEnterpriseAsyncData(listTestPlans, [], '加载测试计划失败');
  const casesState = useEnterpriseAsyncData<TestCaseRecord[]>(
    useCallback(async () => {
      if (!selectedPlan) {
        return [];
      }
      return listTestCases(selectedPlan.id);
    }, [selectedPlan]),
    [],
    '加载测试用例失败'
  );

  const handleCreatePlan = async () => {
    if (!form.name.trim()) {
      Message.warning('名称不能为空');
      return;
    }
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
    if (!selectedPlan || !caseForm.subject.trim()) {
      Message.warning('标题不能为空');
      return;
    }
    setSaving(true);
    try {
      await createTestCase({ ...caseForm, plan_id: selectedPlan.id });
      Message.success('已添加用例');
      setCaseModalVisible(false);
      setCaseForm({ subject: '', steps: '', expected: '', assigned_to: '' });
      await casesState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '添加测试用例失败'));
    } finally {
      setSaving(false);
    }
  };

  const planColumns = [
    { title: '名称', dataIndex: 'name' },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'gray'}>{v}</Tag> },
    {
      title: '操作',
      render: (_: unknown, r: TestPlan) => (
        <Button size='mini' onClick={() => setSelectedPlan(r)}>
          管理用例
        </Button>
      ),
    },
  ];

  const caseColumns = [
    { title: '标题', dataIndex: 'subject' },
    { title: '步骤', dataIndex: 'steps', render: (v: string) => <span className='text-12px text-t-secondary line-clamp-2' style={{ maxWidth: 200 }}>{v || '—'}</span> },
    { title: '预期', dataIndex: 'expected', render: (v: string) => <span className='text-12px text-t-secondary'>{v || '—'}</span> },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'passed' ? 'green' : v === 'failed' ? 'red' : 'orange'}>{v || 'pending'}</Tag> },
  ];

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title='CTest 测试管理'
        description='测试计划、用例编写与持续测试'
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => void plansState.reload()}>
              刷新
            </Button>
            <Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>
              新建测试计划
            </Button>
          </>
        }
      />
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <Card bordered={false} className='rd-12px' title='测试计划'>
          <ModuleDataState
            loading={plansState.loading}
            error={plansState.error}
            empty={plansState.data.length === 0}
            emptyDescription='暂无计划'
          >
            <Table
              data={plansState.data}
              rowKey='id'
              columns={planColumns}
              pagination={false}
              size='small'
              border={false}
            />
          </ModuleDataState>
        </Card>
        <Card bordered={false} className='rd-12px' title={selectedPlan ? `用例: ${selectedPlan.name}` : '测试用例'} extra={selectedPlan ? <Button size='mini' icon={<Plus />} onClick={() => setCaseModalVisible(true)}>添加用例</Button> : null}>
          {!selectedPlan ? (
            <ModuleDataState
              loading={false}
              error={null}
              empty={true}
              emptyDescription='选择左侧测试计划'
            >
              <></>
            </ModuleDataState>
          ) : (
            <ModuleDataState
              loading={casesState.loading}
              error={casesState.error}
              empty={casesState.data.length === 0}
              emptyDescription='暂无用例'
            >
              <Table
                data={casesState.data}
                rowKey='id'
                columns={caseColumns}
                pagination={false}
                size='small'
                border={false}
              />
            </ModuleDataState>
          )}
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
