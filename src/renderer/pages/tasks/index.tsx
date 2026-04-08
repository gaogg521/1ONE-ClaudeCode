/**
 * Tasks — Claude Code 任务看板
 * 可视化管理 Claude Code 内置的 TaskCreate/TaskUpdate/TaskList 任务系统
 */
import React, { useState } from 'react';
import { Button, Tag, Badge } from '@arco-design/web-react';
import { Add } from '@icon-park/react';

type TaskStatus = 'pending' | 'in_progress' | 'completed';

interface Task {
  id: string;
  subject: string;
  status: TaskStatus;
  activeForm?: string;
  sessionName?: string;
}

const MOCK_TASKS: Task[] = [
  { id: '1', subject: '写单元测试', status: 'pending', sessionName: 'auth-refactor' },
  { id: '2', subject: '更新 API 文档', status: 'pending', sessionName: 'auth-refactor' },
  { id: '3', subject: '重构 auth.ts', status: 'in_progress', activeForm: '重构 auth 模块中', sessionName: 'auth-refactor' },
  { id: '4', subject: '读取现有代码结构', status: 'completed', sessionName: 'auth-refactor' },
  { id: '5', subject: '识别 token 刷新逻辑', status: 'completed', sessionName: 'auth-refactor' },
  { id: '6', subject: '抽取 TokenService', status: 'completed', sessionName: 'auth-refactor' },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  pending: { label: '待处理', color: 'var(--color-neutral-3)', dot: '#8c8c8c' },
  in_progress: { label: '进行中', color: 'var(--color-warning-light-2)', dot: '#fa8c16' },
  completed: { label: '已完成', color: 'var(--color-success-light-2)', dot: '#52c41a' },
};

const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
  const cfg = STATUS_CONFIG[task.status];
  return (
    <div
      style={{
        background: 'var(--color-bg-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 8,
        borderLeft: `3px solid ${cfg.dot}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: cfg.dot,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{task.subject}</span>
      </div>
      {task.activeForm && (
        <div style={{ fontSize: 11, color: '#fa8c16', marginTop: 4, paddingLeft: 13 }}>
          ▶ {task.activeForm}
        </div>
      )}
      {task.sessionName && (
        <div style={{ fontSize: 11, color: 'var(--color-text-4)', marginTop: 4, paddingLeft: 13 }}>
          会话: {task.sessionName}
        </div>
      )}
    </div>
  );
};

const Column: React.FC<{ status: TaskStatus; tasks: Task[] }> = ({ status, tasks }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>{cfg.label}</span>
        <Badge count={tasks.length} style={{ background: cfg.dot }} />
      </div>
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
      {tasks.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-4)', textAlign: 'center', padding: '16px 0' }}>
          暂无任务
        </div>
      )}
    </div>
  );
};

const TasksPage: React.FC = () => {
  const [tasks] = useState<Task[]>(MOCK_TASKS);

  const byStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s);

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>任务看板</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size='small' icon={<Add theme='outline' />}>新任务</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden' }}>
        {(['pending', 'in_progress', 'completed'] as TaskStatus[]).map((s) => (
          <Column key={s} status={s} tasks={byStatus(s)} />
        ))}
      </div>
    </div>
  );
};

export default TasksPage;
