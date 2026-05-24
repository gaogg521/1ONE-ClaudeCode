/**
 * CCode Code Repository Management
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Form, Input, Message, Modal, Select, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { Delete, Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';

type CodeRepo = { id: string; name: string; url: string; provider: string; default_branch: string; credential_id: string };

async function api<T>(path: string, opts?: RequestInit): Promise<T> { return fetchWebuiApiJson<T>(path, opts); }
async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withCsrfToken(payload)) });
}

const PROVIDERS: Record<string, string> = { gitlab: 'GitLab', github: 'GitHub', gitee: 'Gitee', other: '其他' };

const CCodeRepoList: React.FC = () => {
  const { t } = useTranslation();
  const [repos, setRepos] = useState<CodeRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', provider: 'gitlab', credential_id: '', default_branch: 'main' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api<{ success: boolean; data: CodeRepo[] }>('/api/admin/code-repos'); if (res?.success) setRepos(res.data ?? []); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) { Message.warning('名称和URL不能为空'); return; }
    setSaving(true);
    try { await apiMutate('/api/admin/code-repos', 'POST', form); Message.success('已绑定'); setModalVisible(false); setForm({ name: '', url: '', provider: 'gitlab', credential_id: '', default_branch: 'main' }); await load(); }
    catch { Message.error('绑定失败'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { try { await apiMutate(`/api/admin/code-repos/${id}`, 'DELETE', {}); await load(); } catch { /* ignore */ } };

  const columns = [
    { title: '名称', dataIndex: 'name' },
    { title: 'URL', dataIndex: 'url', render: (v: string) => <span className='text-12px font-mono text-t-secondary truncate' style={{ maxWidth: 200 }}>{v}</span> },
    { title: '平台', dataIndex: 'provider', render: (v: string) => <Tag color={v === 'gitlab' ? 'orange' : v === 'github' ? 'arcoblue' : 'gray'}>{PROVIDERS[v] || v}</Tag> },
    { title: '默认分支', dataIndex: 'default_branch', render: (v: string) => <Tag size='small'>{v || 'main'}</Tag> },
    { title: '操作', render: (_: unknown, r: CodeRepo) => <Button size='mini' status='danger' icon={<Delete />} onClick={() => void handleDelete(r.id)} /> },
  ];

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'><div><Typography.Title heading={5} className='mt-0 mb-4px'>CCode 代码库</Typography.Title><Typography.Paragraph type='secondary' className='mb-0 text-13px'>统一绑定 GitLab / GitHub / Gitee 代码仓库，支持 MR 管理与代码搜索</Typography.Paragraph></div>
        <Space><Button icon={<Refresh />} onClick={() => void load()}>刷新</Button><Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>绑定代码仓库</Button></Space>
      </div>
      <Card bordered={false} className='rd-12px'>
        {repos.length === 0 && !loading ? <Empty description='暂无绑定的代码仓库' /> : <Table loading={loading} data={repos} rowKey='id' columns={columns} pagination={false} size='small' border={false} />}
      </Card>
      <Modal title='绑定代码仓库' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreate} confirmLoading={saving} okText='绑定' cancelText='取消'>
        <Form layout='vertical'>
          <Form.Item label='名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} placeholder='1ONE-Main' /></Form.Item>
          <Form.Item label='仓库 URL' required><Input value={form.url} onChange={(v) => setForm((s) => ({ ...s, url: v }))} placeholder='https://gitlab.com/team/1one.git' /></Form.Item>
          <Form.Item label='平台'><Select value={form.provider} onChange={(v) => setForm((s) => ({ ...s, provider: String(v) }))}>{Object.entries(PROVIDERS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}</Select></Form.Item>
          <Form.Item label='默认分支'><Input value={form.default_branch} onChange={(v) => setForm((s) => ({ ...s, default_branch: v }))} /></Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default CCodeRepoList;
