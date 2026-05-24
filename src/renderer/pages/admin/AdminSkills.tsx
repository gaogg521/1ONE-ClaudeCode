/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Form, Input, Message, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from '@arco-design/web-react';
import { Delete, Edit, Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from './components/AdminPageWrapper';

type SkillRecord = { id: string; name: string; description: string; content: string; enabled: number; scope: string; team_id: string | null; created_by: string; created_at: number; updated_at: number };

async function api<T>(path: string, opts?: RequestInit): Promise<T> { return fetchWebuiApiJson<T>(path, opts); }
async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withCsrfToken(payload)) });
}

const AdminSkills: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SkillRecord[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [batchVisible, setBatchVisible] = useState(false);
  const [batchJson, setBatchJson] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', content: '', enabled: true, scope: 'personal' as string });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; data: SkillRecord[] }>('/api/admin/skills');
      if (res?.success) setRows(res.data ?? []);
    } catch { Message.error(t('admin.skills.loadFailed', { defaultValue: '加载失败' })); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditId(null); setForm({ name: '', description: '', content: '', enabled: true, scope: 'personal' }); setModalVisible(true); };
  const openEdit = (r: SkillRecord) => { setEditId(r.id); setForm({ name: r.name, description: r.description || '', content: r.content || '', enabled: r.enabled === 1, scope: r.scope || 'personal' }); setModalVisible(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { Message.warning(t('admin.skills.nameRequired', { defaultValue: '名称不能为空' })); return; }
    setSaving(true);
    try {
      await apiMutate('/api/admin/skills', 'POST', { id: editId, ...form, content: form.content.trim() });
      Message.success(editId ? t('admin.skills.updated', { defaultValue: '已更新' }) : t('admin.skills.created', { defaultValue: '已创建' }));
      setModalVisible(false);
      await load();
    } catch { Message.error(t('admin.skills.saveFailed', { defaultValue: '保存失败' })); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await apiMutate(`/api/admin/skills/${id}`, 'DELETE', {}); Message.success(t('admin.skills.deleted', { defaultValue: '已删除' })); await load(); }
    catch { Message.error(t('admin.skills.deleteFailed', { defaultValue: '删除失败' })); }
  };

  const columns = [
    { title: t('admin.skills.name', { defaultValue: '名称' }), dataIndex: 'name' },
    { title: t('admin.skills.description', { defaultValue: '描述' }), dataIndex: 'description', render: (v: string) => v || '—' },
    { title: t('admin.skills.scope', { defaultValue: '范围' }), dataIndex: 'scope', render: (v: string) => v === 'organization' ? <Tag color='arcoblue'>{t('admin.scope.organization', { defaultValue: '组织共享' })}</Tag> : <Tag color='gray'>{t('admin.scope.personal', { defaultValue: '个人' })}</Tag> },
    {
      title: t('admin.skills.enabled', { defaultValue: '启用' }), dataIndex: 'enabled',
      render: (_: unknown, r: SkillRecord) => <Switch size='small' checked={r.enabled === 1} onChange={async (v) => { try { await apiMutate('/api/admin/skills', 'POST', { id: r.id, name: r.name, description: r.description, content: r.content, enabled: v, scope: r.scope }); await load(); } catch { /* ignore */ } }} />
    },
    {
      title: t('admin.skills.actions', { defaultValue: '操作' }),
      render: (_: unknown, r: SkillRecord) => (
        <Space size='mini'>
          <Button size='mini' icon={<Edit />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('admin.skills.confirmDelete', { defaultValue: '确定删除？' })} onOk={() => void handleDelete(r.id)}>
            <Button size='mini' status='danger' icon={<Delete />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'>
        <div>
          <Typography.Title heading={5} className='mt-0 mb-4px'>{t('admin.skills.title', { defaultValue: '企业 Skills 技能仓库' })}</Typography.Title>
          <Typography.Paragraph type='secondary' className='mb-0 text-13px'>{t('admin.skills.desc', { defaultValue: '统一管理企业 AI 技能。管理员可设为"组织共享"供全公司使用。' })}</Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<Refresh />} onClick={() => void load()}>{t('common.refresh', { defaultValue: '刷新' })}</Button>
          <Button type='outline' onClick={() => { setBatchJson(JSON.stringify([{name:'代码审查Skill',description:'自动审查代码规范和安全',content:'# Code Review Skill\n\n检查: console.log, any类型, XSS, setTimeout(0)'},{name:'API文档生成Skill',description:'自动生成REST API文档',content:'# API Doc Skill\n\n解析Express路由生成OpenAPI文档'}],null,2)); setBatchVisible(true); }}>{t('admin.skills.batchImport', { defaultValue: '批量导入' })}</Button>
          <Button type='primary' icon={<Plus />} onClick={openCreate}>{t('admin.skills.create', { defaultValue: '新建技能' })}</Button>
        </Space>
      </div>
      <Card bordered={false} className='rd-12px'>
        <Table loading={loading} data={rows} rowKey='id' columns={columns} pagination={false} size='small' border={false} />
      </Card>
      {rows.length === 0 && !loading && <Empty className='mt-40px' description={t('admin.skills.empty', { defaultValue: '暂无技能，点击上方"新建技能"开始创建' })} />}

      <Modal title={editId ? t('admin.skills.editTitle', { defaultValue: '编辑技能' }) : t('admin.skills.createTitle', { defaultValue: '新建技能' })} visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleSave} confirmLoading={saving} okText={t('common.confirm', { defaultValue: '确定' })} cancelText={t('common.cancel', { defaultValue: '取消' })}>
        <Form layout='vertical'>
          <Form.Item label={t('admin.skills.name', { defaultValue: '名称' })} required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} /></Form.Item>
          <Form.Item label={t('admin.skills.description', { defaultValue: '描述' })}><Input value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} /></Form.Item>
          <Form.Item label={t('admin.skills.content', { defaultValue: 'Skill 内容 (Markdown)' })}><Input.TextArea value={form.content} onChange={(v) => setForm((s) => ({ ...s, content: v }))} autoSize={{ minRows: 4, maxRows: 12 }} /></Form.Item>
          <Form.Item label={t('admin.skills.scope', { defaultValue: '可见范围' })}><Select value={form.scope} onChange={(v) => setForm((s) => ({ ...s, scope: String(v) }))}><Select.Option value='personal'>{t('admin.scope.personal', { defaultValue: '个人' })}</Select.Option><Select.Option value='organization'>{t('admin.scope.organization', { defaultValue: '组织共享' })}</Select.Option></Select></Form.Item>
        </Form>
      </Modal>

      <Modal title={t('admin.skills.batchImport', { defaultValue: '批量导入技能 (JSON)' })} visible={batchVisible} onCancel={() => setBatchVisible(false)} onOk={async () => { try { const items = JSON.parse(batchJson); if (!Array.isArray(items)) { Message.error('必须是JSON数组'); return; } setBatchSaving(true); try { const res = await apiMutate<{success:boolean;data:{count:number}}>('/api/admin/skills/batch', 'POST', { items }); if (res?.success) { Message.success(`成功导入 ${res.data?.count??items.length} 个技能`); setBatchVisible(false); setBatchJson(''); await load(); } } catch { Message.error('导入失败'); } finally { setBatchSaving(false); } } catch { Message.error('JSON格式错误'); } }} confirmLoading={batchSaving} okText={t('common.import', { defaultValue: '导入' })} cancelText={t('common.cancel', { defaultValue: '取消' })}>
        <Form layout='vertical'><Form.Item label='JSON (数组)'>
          <Input.TextArea value={batchJson} onChange={setBatchJson} autoSize={{ minRows: 8, maxRows: 20 }} placeholder='[{"name":"Skill名称","description":"描述","content":"Markdown内容"},...]' />
        </Form.Item></Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default AdminSkills;
