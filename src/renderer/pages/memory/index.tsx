/**
 * Memory — Claude Code 记忆管理
 * 可视化管理 CLAUDE.md 和 MEMORY.md，查看/编辑记忆条目
 */
import React, { useState } from 'react';
import { Button, Tabs, Table, Tag, Modal } from '@arco-design/web-react';
import { Add, Edit, Delete, FileText } from '@icon-park/react';

interface MemoryFile {
  name: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  description: string;
  path: string;
  updatedAt: string;
}

const MOCK_MEMORIES: MemoryFile[] = [
  {
    name: '1ONE 用户角色',
    type: 'user',
    description: '用户是 1ONE，OpenClaw CEO，负责战略调度',
    path: 'memory/user_role.md',
    updatedAt: '2026-04-07',
  },
  {
    name: '测试规范反馈',
    type: 'feedback',
    description: '集成测试必须连接真实数据库，不能使用 mock',
    path: 'memory/feedback_testing.md',
    updatedAt: '2026-04-07',
  },
  {
    name: 'OpenClaw 战队',
    type: 'project',
    description: 'OpenClaw 10 人专家战队结构与飞书集成',
    path: 'memory/project_openclaw.md',
    updatedAt: '2026-04-07',
  },
  {
    name: '1ONE ClaudeCode 项目',
    type: 'project',
    description: '桌面应用架构方案，Electron+React，8个核心模块',
    path: 'memory/project_ONE_command.md',
    updatedAt: '2026-04-07',
  },
];

const TYPE_COLOR: Record<string, string> = {
  user: 'arcoblue',
  feedback: 'orange',
  project: 'green',
  reference: 'purple',
};

const TYPE_LABEL: Record<string, string> = {
  user: '用户',
  feedback: '反馈',
  project: '项目',
  reference: '参考',
};

const MemoryPage: React.FC = () => {
  const [memories] = useState<MemoryFile[]>(MOCK_MEMORIES);
  const [activeTab, setActiveTab] = useState('auto');
  const [editVisible, setEditVisible] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryFile | null>(null);

  const memoryColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (v: string, record: MemoryFile) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText theme='outline' size={14} />
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (v: string) => <Tag size='small' color={TYPE_COLOR[v]}>{TYPE_LABEL[v]}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      render: (v: string) => <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{v}</span>,
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 100, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    {
      title: '操作',
      render: (_: unknown, record: MemoryFile) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            type='text'
            size='mini'
            icon={<Edit theme='outline' size={13} />}
            onClick={() => { setSelectedMemory(record); setEditVisible(true); }}
          />
          <Button type='text' size='mini' status='danger' icon={<Delete theme='outline' size={13} />} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>记忆管理</h2>
        <Button type='primary' size='small' icon={<Add theme='outline' />}>新增记忆</Button>
      </div>

      <Tabs activeTab={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane key='auto' title='自动记忆 (MEMORY.md)'>
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-3)' }}>
            路径: ~/.claude/projects/.../memory/MEMORY.md · 前 200 行自动加载到每次会话
          </div>
          <Table
            columns={memoryColumns}
            data={memories}
            rowKey='path'
            size='small'
            pagination={false}
          />
        </Tabs.TabPane>

        <Tabs.TabPane key='global' title='全局 CLAUDE.md'>
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-3)' }}>
            路径: ~/.claude/CLAUDE.md · 所有项目通用的全局指令
          </div>
          <div
            style={{
              background: 'var(--color-fill-2)',
              borderRadius: 6,
              padding: 16,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              color: 'var(--color-text-2)',
              maxHeight: 400,
              overflowY: 'auto',
            }}
          >
            {`# CLAUDE.md（全局配置）

## 我的角色定位
我是 CTO，与 OpenClaw 的 CEO（agent-1one / 1ONE总指挥）共同为用户服务。

## 1ONE 专家战队（OpenClaw）
配置来源：~/.openclaw/openclaw.json
...`}
          </div>
          <Button size='small' style={{ marginTop: 8 }} icon={<Edit theme='outline' size={13} />}>
            在编辑器中打开
          </Button>
        </Tabs.TabPane>

        <Tabs.TabPane key='project' title='项目 CLAUDE.md'>
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-3)' }}>
            路径: .claude/CLAUDE.md · 当前项目专用指令
          </div>
          <div style={{ textAlign: 'center', color: 'var(--color-text-4)', padding: '40px 0' }}>
            当前目录未找到项目 CLAUDE.md
            <div style={{ marginTop: 8 }}>
              <Button size='small' type='primary' icon={<Add theme='outline' size={13} />}>创建</Button>
            </div>
          </div>
        </Tabs.TabPane>
      </Tabs>

      <Modal
        title={`编辑记忆: ${selectedMemory?.name}`}
        visible={editVisible}
        onOk={() => setEditVisible(false)}
        onCancel={() => setEditVisible(false)}
        okText='保存'
        cancelText='取消'
        style={{ width: 600 }}
      >
        <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--color-fill-2)', padding: 12, borderRadius: 6 }}>
          {selectedMemory?.description}
        </div>
      </Modal>
    </div>
  );
};

export default MemoryPage;
