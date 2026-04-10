/**
 * Tasks — 任务看板
 * 本地任务管理，支持新增/编辑/状态切换
 */
import React, { useState, useCallback } from 'react';
import { Button, Badge, Modal, Form, Input, Message } from '@arco-design/web-react';
import { Add, Edit, DeleteFour } from '@icon-park/react';
import { ConfigStorage } from '@/common/config/storage';
import AionSelect from '@/renderer/components/base/AionSelect';

type TaskStatus = 'pending' | 'in_progress' | 'completed';

interface Task {
  id: string;
  subject: string;
  status: TaskStatus;
  activeForm?: string;
  sessionName?: string;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string }> = {
  pending: { label: '待处理', dot: 'var(--color-text-4)' },
  in_progress: { label: '进行中', dot: 'var(--warning)' },
  completed: { label: '已完成', dot: 'var(--success)' },
};

const STORAGE_KEY = 'tasks.board' as any;

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem('1one_tasks');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveTasks(tasks: Task[]): void {
  localStorage.setItem('1one_tasks', JSON.stringify(tasks));
}

const EMPTY_FORM = { subject: '', status: 'pending' as TaskStatus, activeForm: '', sessionName: '' };

const TaskCard: React.FC<{ task: Task; onEdit: (t: Task) => void; onDelete: (id: string) => void; onStatusChange: (id: string, s: TaskStatus) => void }> = ({ task, onEdit, onDelete, onStatusChange }) => {
  const cfg = STATUS_CONFIG[task.status];
  return (
    <div
      className='bg-bg-2 border border-border-1 rd-6px p-10px mb-8px group relative'
      style={{ borderLeft: `3px solid ${cfg.dot}` }}
    >
      <div className='flex items-center gap-6px'>
        <span className='w-7px h-7px rd-full shrink-0' style={{ background: cfg.dot }} />
        <span className='text-13px font-500 flex-1 text-t-primary'>{task.subject}</span>
        <div className='flex items-center gap-4px opacity-0 group-hover:opacity-100 transition-opacity'>
          <AionSelect
            value={task.status}
            size='mini'
            onChange={(v) => onStatusChange(task.id, v as TaskStatus)}
            style={{ width: 72 }}
          >
            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
              <AionSelect.Option key={s} value={s}>
                <span className='text-11px'>{STATUS_CONFIG[s].label}</span>
              </AionSelect.Option>
            ))}
          </AionSelect>
          <Button size='mini' icon={<Edit size={12} />} onClick={() => onEdit(task)} />
          <Button size='mini' status='danger' icon={<DeleteFour size={12} />} onClick={() => onDelete(task.id)} />
        </div>
      </div>
      {task.activeForm && (
        <div className='text-11px mt-4px pl-13px text-[var(--warning)]'>▶ {task.activeForm}</div>
      )}
      {task.sessionName && (
        <div className='text-11px text-t-tertiary mt-4px pl-13px'>会话: {task.sessionName}</div>
      )}
    </div>
  );
};

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const persist = useCallback((next: Task[]) => {
    setTasks(next);
    saveTasks(next);
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({ subject: t.subject, status: t.status, activeForm: t.activeForm ?? '', sessionName: t.sessionName ?? '' });
    setModalVisible(true);
  };

  const handleSubmit = () => {
    if (!form.subject.trim()) { Message.warning('请填写任务名称'); return; }
    const entry: Task = {
      id: editing?.id ?? String(Date.now()),
      subject: form.subject.trim(),
      status: form.status,
      activeForm: form.activeForm.trim() || undefined,
      sessionName: form.sessionName.trim() || undefined,
    };
    const next = editing ? tasks.map(t => t.id === editing.id ? entry : t) : [...tasks, entry];
    persist(next);
    setModalVisible(false);
  };

  const handleDelete = useCallback((id: string) => {
    Modal.confirm({
      title: '删除任务',
      content: '确认删除此任务？',
      onOk: () => persist(tasks.filter(t => t.id !== id)),
    });
  }, [tasks, persist]);

  const handleStatusChange = useCallback((id: string, status: TaskStatus) => {
    persist(tasks.map(t => t.id === id ? { ...t, status } : t));
  }, [tasks, persist]);

  const byStatus = (s: TaskStatus) => tasks.filter(t => t.status === s);

  return (
    <div className='p-20px flex flex-col h-full'>
      <div className='flex items-center justify-between mb-20px'>
        <h2 className='m-0 text-18px font-700 text-t-primary'>任务看板</h2>
        <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={openAdd}>
          ＋新任务
        </Button>
      </div>

      <div className='flex gap-20px flex-1 overflow-hidden'>
        {(['pending', 'in_progress', 'completed'] as TaskStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          const col = byStatus(s);
          return (
            <div key={s} className='flex-1 min-w-0 flex flex-col'>
              <div className='flex items-center gap-8px mb-12px pb-8px border-b border-border-1'>
                <span className='font-600 text-13px text-t-primary'>{cfg.label}</span>
                <Badge count={col.length} style={{ background: cfg.dot }} />
              </div>
              <div className='flex-1 overflow-y-auto'>
                {col.map(t => (
                  <TaskCard key={t.id} task={t} onEdit={openEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} />
                ))}
                {col.length === 0 && (
                  <div className='text-12px text-t-tertiary text-center py-16px'>暂无任务</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        okText='保存'
        cancelText='取消'
      >
        <Form layout='vertical' className='space-y-12px'>
          <Form.Item label='任务名称' required>
            <Input placeholder='例如: 修复登录 Bug' value={form.subject} onChange={v => setForm(f => ({ ...f, subject: v }))} />
          </Form.Item>
          <Form.Item label='状态'>
            <AionSelect value={form.status} onChange={v => setForm(f => ({ ...f, status: v as TaskStatus }))}>
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
                <AionSelect.Option key={s} value={s}>{STATUS_CONFIG[s].label}</AionSelect.Option>
              ))}
            </AionSelect>
          </Form.Item>
          <Form.Item label='当前进度描述 (可选)'>
            <Input placeholder='例如: 正在分析代码' value={form.activeForm} onChange={v => setForm(f => ({ ...f, activeForm: v }))} />
          </Form.Item>
          <Form.Item label='关联会话 (可选)'>
            <Input placeholder='例如: auth-refactor' value={form.sessionName} onChange={v => setForm(f => ({ ...f, sessionName: v }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TasksPage;
