/**
 * CTeam Milestone View — Version planning with Gantt-style timeline
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, DatePicker, Empty, Form, Input, Message, Modal, Progress, Space, Table, Tag, Timeline, Typography } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';

type Milestone = { id: string; name: string; description: string; due_date: string; epic_count: number; completed_count: number; created_at: number };

async function api<T>(path: string, opts?: RequestInit): Promise<T> { return fetchWebuiApiJson<T>(path, opts); }
async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withCsrfToken(payload)) });
}

const MilestoneView: React.FC = () => {
  const { t } = useTranslation();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', due_date: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: Milestone[] }>('/api/admin/milestones');
      if (res?.success) setMilestones(res.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) { Message.warning('版本名称不能为空'); return; }
    setSaving(true);
    try { await apiMutate('/api/admin/milestones', 'POST', form); Message.success('已创建'); setModalVisible(false); setForm({ name: '', description: '', due_date: '' }); await load(); }
    catch { Message.error('创建失败'); } finally { setSaving(false); }
  };

  const now = Date.now();

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'>
        <div><Typography.Title heading={5} className='mt-0 mb-4px'>版本规划 Milestones</Typography.Title><Typography.Paragraph type='secondary' className='mb-0 text-13px'>Epic 绑定版本里程碑，自动统计完成进度</Typography.Paragraph></div>
        <Space><Button icon={<Refresh />} onClick={() => void load()}>刷新</Button><Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>新建里程碑</Button></Space>
      </div>
      {milestones.length === 0 && !loading ? <Empty description='暂无版本里程碑' /> : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16px'>
          {milestones.map((m) => {
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
      )}
      <Modal title='新建里程碑' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreate} confirmLoading={saving} okText='创建' cancelText='取消'>
        <Form layout='vertical'>
          <Form.Item label='版本名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} placeholder='v1.11.0' /></Form.Item>
          <Form.Item label='描述'><Input.TextArea value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} /></Form.Item>
          <Form.Item label='截止日期'><DatePicker value={form.due_date} onChange={(v) => setForm((s) => ({ ...s, due_date: String(v || '') }))} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default MilestoneView;
