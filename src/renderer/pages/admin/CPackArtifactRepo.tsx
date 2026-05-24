/**
 * CPack Artifact Repository Management
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Form, Input, Message, Modal, Select, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { Delete, Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';

type ArtifactRepo = { id: string; name: string; repo_type: string; endpoint: string };
type Artifact = { id: string; name: string; version: string; file_size: number; checksum: string; repo_name: string; download_count: number; scope: string };

async function api<T>(path: string, opts?: RequestInit): Promise<T> { return fetchWebuiApiJson<T>(path, opts); }
async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withCsrfToken(payload)) });
}

const REPO_TYPES: Record<string, string> = { generic: 'Generic 通用', docker: 'Docker 镜像', maven: 'Maven 构件', 'ai-model': 'AI 模型' };

const CPackArtifactRepo: React.FC = () => {
  const { t } = useTranslation();
  const [repos, setRepos] = useState<ArtifactRepo[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', repo_type: 'generic', endpoint: '' });
  const [saving, setSaving] = useState(false);

  const loadRepos = useCallback(async () => {
    try { const res = await api<{ success: boolean; data: ArtifactRepo[] }>('/api/admin/artifact-repos'); if (res?.success) setRepos(res.data ?? []); } catch { /* ignore */ }
  }, []);
  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    try { const res = await api<{ success: boolean; data: Artifact[] }>('/api/admin/artifacts'); if (res?.success) setArtifacts(res.data ?? []); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadRepos(); void loadArtifacts(); }, [loadArtifacts, loadRepos]);

  const handleCreate = async () => {
    if (!form.name.trim()) { Message.warning('名称不能为空'); return; }
    setSaving(true);
    try { await apiMutate('/api/admin/artifact-repos', 'POST', form); Message.success('已创建'); setModalVisible(false); setForm({ name: '', repo_type: 'generic', endpoint: '' }); await loadRepos(); }
    catch { Message.error('创建失败'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { try { await apiMutate(`/api/admin/artifact-repos/${id}`, 'DELETE', {}); await loadRepos(); } catch { /* ignore */ } };

  const repoColumns = [
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'repo_type', render: (v: string) => <Tag>{REPO_TYPES[v] || v}</Tag> },
    { title: '端点', dataIndex: 'endpoint', render: (v: string) => v || '—' },
    { title: '操作', render: (_: unknown, r: ArtifactRepo) => <Button size='mini' status='danger' icon={<Delete />} onClick={() => void handleDelete(r.id)} /> },
  ];

  const artifactColumns = [
    { title: '名称', dataIndex: 'name' },
    { title: '版本', dataIndex: 'version' },
    { title: '大小', dataIndex: 'file_size', render: (v: number) => v ? `${(v / 1024).toFixed(1)} KB` : '—' },
    { title: '仓库', dataIndex: 'repo_name' },
    { title: '下载', dataIndex: 'download_count' },
    { title: '范围', dataIndex: 'scope', render: (v: string) => <Tag color={v === 'organization' ? 'arcoblue' : 'gray'}>{v === 'organization' ? '组织' : '个人'}</Tag> },
  ];

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'><div><Typography.Title heading={5} className='mt-0 mb-4px'>CPack 制品管理</Typography.Title><Typography.Paragraph type='secondary' className='mb-0 text-13px'>统一管理 Generic / Docker / Maven / AI 模型制品，支持安全扫描与分发</Typography.Paragraph></div>
        <Space><Button icon={<Refresh />} onClick={() => { void loadRepos(); void loadArtifacts(); }}>刷新</Button><Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>新建制品仓库</Button></Space>
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <Card bordered={false} className='rd-12px' title='制品仓库'>
          {repos.length === 0 ? <Empty description='暂无仓库' /> : <Table data={repos} rowKey='id' columns={repoColumns} pagination={false} size='small' border={false} />}
        </Card>
        <Card bordered={false} className='rd-12px' title='制品列表'>
          {artifacts.length === 0 ? <Empty description='暂无制品' /> : <Table loading={loading} data={artifacts} rowKey='id' columns={artifactColumns} pagination={false} size='small' border={false} />}
        </Card>
      </div>
      <Modal title='新建制品仓库' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreate} confirmLoading={saving} okText='创建' cancelText='取消'>
        <Form layout='vertical'>
          <Form.Item label='名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} /></Form.Item>
          <Form.Item label='类型'><Select value={form.repo_type} onChange={(v) => setForm((s) => ({ ...s, repo_type: String(v) }))}>{Object.entries(REPO_TYPES).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}</Select></Form.Item>
          <Form.Item label='端点 URL'><Input value={form.endpoint} onChange={(v) => setForm((s) => ({ ...s, endpoint: v }))} placeholder='https://registry.example.com' /></Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default CPackArtifactRepo;
