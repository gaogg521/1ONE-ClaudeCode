/**
 * Hooks — Claude Code Hook 监控与配置
 * 可视化 settings.json 中注册的 Hook，实时显示触发日志
 */
import React, { useState, useRef, useEffect } from 'react';
import { Button, Table, Tag, Switch, Tabs } from '@arco-design/web-react';
import { Add, Pause, Delete, LoadingFour } from '@icon-park/react';

interface HookEntry {
  id: string;
  event: string;
  handler: string;
  enabled: boolean;
  scope: 'user' | 'project';
}

interface LogEntry {
  time: string;
  event: string;
  tool?: string;
  result: 'ALLOW' | 'DENY' | 'OK' | 'TRIGGERED';
  detail?: string;
}

const MOCK_HOOKS: HookEntry[] = [
  { id: '1', event: 'PreToolUse', handler: 'feishu_notify.py', enabled: true, scope: 'user' },
  { id: '2', event: 'PostToolUse', handler: 'log_to_sqlite.js', enabled: true, scope: 'user' },
  { id: '3', event: 'SessionEnd', handler: 'openclaw_bridge.py', enabled: true, scope: 'user' },
  { id: '4', event: 'TaskCompleted', handler: 'notify_1one.sh', enabled: true, scope: 'project' },
  { id: '5', event: 'UserPromptSubmit', handler: 'input_logger.py', enabled: false, scope: 'project' },
];

const MOCK_LOGS: LogEntry[] = [
  { time: '14:45:01', event: 'PreToolUse', tool: 'Bash: npm test', result: 'ALLOW' },
  { time: '14:45:03', event: 'PostToolUse', tool: 'Bash: npm test', result: 'OK', detail: 'exit 0' },
  { time: '14:45:03', event: 'PostToolUse', tool: 'feishu_notify', result: 'TRIGGERED' },
  { time: '14:44:10', event: 'PreToolUse', tool: 'Edit: auth.ts', result: 'ALLOW' },
  { time: '14:44:12', event: 'PostToolUse', tool: 'Edit: auth.ts', result: 'OK' },
];

const RESULT_COLOR: Record<string, string> = {
  ALLOW: 'green',
  DENY: 'red',
  OK: 'arcoblue',
  TRIGGERED: 'orange',
};

const HooksPage: React.FC = () => {
  const [hooks, setHooks] = useState<HookEntry[]>(MOCK_HOOKS);
  const [logs] = useState<LogEntry[]>(MOCK_LOGS);
  const [paused, setPaused] = useState(false);

  const toggleHook = (id: string) => {
    setHooks((prev) => prev.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)));
  };

  const hookColumns = [
    { title: '事件', dataIndex: 'event', render: (v: string) => <Tag color='arcoblue'>{v}</Tag> },
    { title: '处理器', dataIndex: 'handler', render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
    {
      title: '范围',
      dataIndex: 'scope',
      render: (v: string) => <Tag color={v === 'user' ? 'purple' : 'green'}>{v === 'user' ? '全局' : '项目'}</Tag>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      render: (v: boolean, record: HookEntry) => (
        <Switch checked={v} onChange={() => toggleHook(record.id)} size='small' />
      ),
    },
    {
      title: '操作',
      render: (_: unknown, record: HookEntry) => (
        <Button type='text' size='mini' status='danger' icon={<Delete theme='outline' size={13} />} />
      ),
    },
  ];

  const logColumns = [
    { title: '时间', dataIndex: 'time', width: 80, render: (v: string) => <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</span> },
    { title: '事件', dataIndex: 'event', width: 130, render: (v: string) => <Tag size='small' color='arcoblue'>{v}</Tag> },
    { title: '工具/详情', dataIndex: 'tool', render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</span> },
    {
      title: '结果',
      dataIndex: 'result',
      width: 90,
      render: (v: string) => <Tag size='small' color={RESULT_COLOR[v] ?? 'gray'}>{v}</Tag>,
    },
  ];

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Hook 监控</h2>
        <Button type='primary' size='small' icon={<Add theme='outline' />}>添加 Hook</Button>
      </div>

      <Tabs defaultActiveTab='config' style={{ flex: 1 }}>
        <Tabs.TabPane key='config' title='Hook 配置'>
          <Table
            columns={hookColumns}
            data={hooks}
            rowKey='id'
            size='small'
            pagination={false}
            style={{ marginTop: 8 }}
          />
        </Tabs.TabPane>

        <Tabs.TabPane key='logs' title='实时日志'>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
            <Button
              size='small'
              type={paused ? 'primary' : 'default'}
              icon={paused ? <LoadingFour theme='outline' size={13} /> : <Pause theme='outline' size={13} />}
              onClick={() => setPaused(!paused)}
            >
              {paused ? '恢复' : '暂停'}
            </Button>
            <Button size='small'>清空</Button>
          </div>
          <Table
            columns={logColumns}
            data={logs}
            rowKey={(r, i) => String(i)}
            size='small'
            pagination={false}
          />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default HooksPage;
