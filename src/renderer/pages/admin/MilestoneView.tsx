/**
 * CTeam Milestone View — Version planning with Gantt-style timeline
 */
import React, { useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Progress, Space, Tag, Typography } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createMilestone,
  listMilestones,
  type MilestoneRecord,
} from '@/renderer/utils/enterpriseApi/modules';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';

type Milestone = MilestoneRecord;

const MilestoneView: React.FC = () => {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', due_date: '' });
  const [saving, setSaving] = useState(false);

  const milestonesState = useEnterpriseAsyncData(
    listMilestones,
    [],
    t('admin.milestones.loadFailed', { defaultValue: '加载里程碑失败' })
  );

  const handleCreate = async () => {
    if (!form.name.trim()) { Message.warning('版本名称不能为空'); return; }
    if (form.due_date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date.trim())) {
      Message.warning('截止日期格式需为 YYYY-MM-DD');
      return;
    }
    setSaving(true);
    try {
      await createMilestone({
        ...form,
        due_date: form.due_date.trim(),
      });
      Message.success('已创建');
      setModalVisible(false);
      setForm({ name: '', description: '', due_date: '' });
      await milestonesState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '创建失败'));
    } finally { setSaving(false); }
  };

  const now = Date.now();

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title='版本规划 Milestones'
        description='Epic 绑定版本里程碑，自动统计完成进度'
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => void milestonesState.reload()}>刷新</Button>
            <Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>新建里程碑</Button>
          </>
        }
      />
      <ModuleDataState
        loading={milestonesState.loading}
        error={milestonesState.error}
        empty={milestonesState.data.length === 0}
        emptyDescription='暂无版本里程碑'
      >
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16px'>
          {milestonesState.data.map((m) => {
            const progress = m.epic_count > 0 ? Math.round((m.completed_count / m.epic_count) * 100) : 0;
            const isOverdue = new Date(m.due_date).getTime() < now;
            return (
              <Card key={m.id} bordered={false} className='rd-12px hover:-translate-y-2px transition-all' style={{ borderLeft: `4px solid ${progress === 100 ? 'rgb(var(--success-6))' : isOverdue ? 'rgb(var(--danger-6))' : 'rgb(var(--primary-6))'}` }}>
                <div className='flex items-center justify-between mb-6px'><Typography.Text bold className='text-15px'>{m.name}</Typography.Text><Tag color={progress === 100 ? 'green' : isOverdue ? 'red' : 'arcoblue'}>{progress === 100 ? '已完成' : isOverdue ? '已逾期' : '进行中'}</Tag></div>
                {m.description && <Typography.Paragraph type='secondary' className='text-12px mb-8px'>{m.description}</Typography.Paragraph>}
                <div className='flex items-center justify-between text-12px text-t-tertiary mb-8px'><span>截止: {m.due_date || '—'}</span><span>{m.completed_count}/{m.epic_count} Epic</span></div>
                <Progress percent={progress} size='small' color={progress === 100 ? 'rgb(var(--success-6))' : isOverdue ? 'rgb(var(--danger-6))' : undefined} />
              </Card>
            );
          })}
        </div>
      </ModuleDataState>
      <Modal title='新建里程碑' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreate} confirmLoading={saving} okText='创建' cancelText='取消'>
        <Form layout='vertical'>
          <Form.Item label='版本名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} placeholder='v1.11.0' /></Form.Item>
          <Form.Item label='描述'><Input.TextArea value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} /></Form.Item>
          <Form.Item label='截止日期'>
            <Input
              value={form.due_date}
              onChange={(value) => setForm((s) => ({ ...s, due_date: value }))}
              placeholder='YYYY-MM-DD'
            />
          </Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default MilestoneView;
