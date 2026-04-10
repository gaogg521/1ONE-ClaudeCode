/**
 * Hooks — Claude Code Hook 监控与配置
 * 还原原始设计：双 Tab（配置+日志）、启用开关、简洁处理器列名
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Table, Tag, Switch, Tabs, Modal, Form, Input, Message } from '@arco-design/web-react';
import { Add, Delete, Write } from '@icon-park/react';
import { hooks as hooksIpc, type HookEntry } from '@/common/adapter/ipcBridge';
import AionSelect from '@/renderer/components/base/AionSelect';

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'PreCompact', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop'];

const EVENT_COLORS: Record<string, string> = {
  PreToolUse: 'arcoblue', PostToolUse: 'purple', PreCompact: 'orange',
  UserPromptSubmit: 'green', Notification: 'gold', Stop: 'red', SubagentStop: 'pinkpurple',
};

const EMPTY_FORM: { event: string; matcher: string; command: string; scope: HookEntry['scope'] } = {
  event: 'PreToolUse',
  matcher: '',
  command: '',
  scope: 'user',
};

const HooksPage: React.FC = () => {
  const [hookList, setHookList] = useState<HookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingHook, setEditingHook] = useState<HookEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadHooks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await hooksIpc.list.invoke();
      setHookList(result ?? []);
    } catch {
      Message.error('读取 Hook 配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHooks(); }, [loadHooks]);

  const persist = useCallback(async (entries: HookEntry[]) => {
    setSaving(true);
    try {
      await hooksIpc.save.invoke({ entries });
      setHookList(entries);
    } catch {
      Message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    void persist(hookList.map(h => h.id === id ? { ...h, enabled } : h));
  }, [hookList, persist]);

  const handleDelete = useCallback((id: string) => {
    Modal.confirm({
      title: '删除 Hook',
      content: '确认删除此 Hook？',
      okButtonProps: { status: 'danger' },
      onOk: () => persist(hookList.filter(h => h.id !== id)),
    });
  }, [hookList, persist]);

  const openAdd = () => { setEditingHook(null); setForm(EMPTY_FORM); setModalVisible(true); };
  const openEdit = (h: HookEntry) => {
    setEditingHook(h);
    setForm({ event: h.event, matcher: h.matcher ?? '', command: h.command, scope: h.scope });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!form.command.trim()) { Message.warning('请填写处理器命令'); return; }
    const entry: HookEntry = {
      id: editingHook?.id ?? `${form.event}:${form.matcher}:${form.command}:${Date.now()}`,
      event: form.event, matcher: form.matcher || undefined,
      command: form.command, scope: form.scope, enabled: editingHook?.enabled ?? true,
    };
    await persist(editingHook ? hookList.map(h => h.id === editingHook.id ? entry : h) : [...hookList, entry]);
    setModalVisible(false);
  };

  const hookColumns = [
    { title: '事件', dataIndex: 'event', width: 160, render: (v: string) => <Tag color={EVENT_COLORS[v] ?? 'gray'} size='small'>{v}</Tag> },
    { title: '处理器', dataIndex: 'command', render: (v: string) => {
      const name = v.split(/[/\\]/).pop() ?? v;
      return <code className='text-12px'>{name}</code>;
    }},
    { title: '范围', dataIndex: 'scope', width: 80, render: (v: string) =>
      <Tag color={v === 'user' ? 'purple' : 'green'} size='small'>{v === 'user' ? '全局' : '项目'}</Tag>
    },
    { title: '启用', dataIndex: 'enabled', width: 80, render: (v: boolean, record: HookEntry) =>
      <Switch checked={v !== false} size='small' onChange={(checked) => handleToggle(record.id, checked)} />
    },
    { title: '操作', width: 80, render: (_: unknown, record: HookEntry) => (
      <div className='flex items-center gap-4px'>
        <Button size='mini' icon={<Write size={12} />} onClick={() => openEdit(record)} />
        <Button size='mini' status='danger' icon={<Delete size={12} />} onClick={() => handleDelete(record.id)} />
      </div>
    )},
  ];

  return (
    <div className='flex flex-col h-full' style={{ padding: '20px 24px' }}>
      <div className='flex items-center justify-between mb-16px'>
        <h2 className='m-0 text-18px font-700 text-t-primary'>Hook 监控</h2>
        <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={openAdd} loading={saving}>
          添加 Hook
        </Button>
      </div>

      <Tabs defaultActiveTab='config' className='flex-1'>
        <Tabs.TabPane key='config' title='Hook 配置'>
          <Table
            columns={hookColumns}
            data={hookList}
            rowKey='id'
            loading={loading}
            size='small'
            pagination={false}
            style={{ marginTop: 8 }}
            noDataElement={
              <div className='text-center py-32px text-t-secondary text-12px'>
                <div className='text-16px mb-8px'>🪝</div>
                暂无 Hook — 读取自 <code>~/.claude/settings.json</code>
              </div>
            }
          />
        </Tabs.TabPane>
        <Tabs.TabPane key='logs' title='实时日志'>
          <div className='text-12px text-t-tertiary text-center py-32px'>
            实时日志功能开发中，Claude Code Hook 执行日志将在此显示。
          </div>
        </Tabs.TabPane>
      </Tabs>

      <Modal
        title={editingHook ? '编辑 Hook' : '添加 Hook'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        okText='保存' cancelText='取消'
        okButtonProps={{ loading: saving }}
      >
        <Form layout='vertical' className='space-y-12px'>
          <Form.Item label='事件类型'>
            <AionSelect value={form.event} onChange={v => setForm(f => ({ ...f, event: v }))}>
              {HOOK_EVENTS.map(e => <AionSelect.Option key={e} value={e}><Tag color={EVENT_COLORS[e] ?? 'gray'} size='small'>{e}</Tag></AionSelect.Option>)}
            </AionSelect>
          </Form.Item>
          <Form.Item label='匹配器 (可选)' extra='留空 = 匹配所有工具，或填写工具名如 Bash'>
            <Input placeholder='例如: Bash' value={form.matcher} onChange={v => setForm(f => ({ ...f, matcher: v }))} />
          </Form.Item>
          <Form.Item label='处理器命令' required extra='Python/Shell 脚本路径'>
            <Input placeholder='例如: python ~/.claude/hooks/notify.py' value={form.command} onChange={v => setForm(f => ({ ...f, command: v }))} />
          </Form.Item>
          <Form.Item label='范围'>
            <AionSelect value={form.scope} onChange={v => setForm(f => ({ ...f, scope: v as 'user' | 'project' }))}>
              <AionSelect.Option value='user'>全局 (User)</AionSelect.Option>
              <AionSelect.Option value='project'>项目 (Project)</AionSelect.Option>
            </AionSelect>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default HooksPage;
