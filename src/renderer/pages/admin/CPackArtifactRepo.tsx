/**
 * CPack Artifact Repository Management
 */
import React, { useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Select, Table, Tag } from '@arco-design/web-react';
import { Delete, Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useTeamNameMap } from '@/renderer/hooks/enterprise/useTeamNameMap';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ResourceScopeFields from '@/renderer/pages/admin/components/ResourceScopeFields';
import ScopeOwnershipCell from '@/renderer/pages/admin/components/ScopeOwnershipCell';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createArtifactRepo,
  deleteArtifactRepo,
  listArtifactRepos,
  listArtifacts,
  type ArtifactRecord,
  type ArtifactRepo,
} from '@/renderer/utils/enterpriseApi/modules';

const REPO_TYPES: Record<string, string> = {
  generic: 'Generic 通用',
  docker: 'Docker 镜像',
  maven: 'Maven 构件',
  'ai-model': 'AI 模型',
};

const CPackArtifactRepo: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const isAdmin = isEnterpriseAdminRole(effectiveRole ?? user?.role);
  const { getTeamName, teams } = useTeamNameMap();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', repo_type: 'generic', endpoint: '' });
  const [resourceScope, setResourceScope] = useState({ scope: 'personal', teamId: null as string | null });
  const [saving, setSaving] = useState(false);
  const reposState = useEnterpriseAsyncData(listArtifactRepos, [], '加载制品仓库失败');
  const artifactsState = useEnterpriseAsyncData(listArtifacts, [], '加载制品列表失败');

  const handleCreate = async () => {
    if (!form.name.trim()) {
      Message.warning('名称不能为空');
      return;
    }
    if (resourceScope.scope === 'team' && !resourceScope.teamId) {
      Message.warning(t('admin.scope.teamRequired', { defaultValue: '请选择团队' }));
      return;
    }
    setSaving(true);
    try {
      await createArtifactRepo({
        ...form,
        scope: resourceScope.scope,
        ...(resourceScope.scope === 'team' && resourceScope.teamId ? { team_id: resourceScope.teamId } : {}),
      });
      Message.success('已创建');
      setModalVisible(false);
      setForm({ name: '', repo_type: 'generic', endpoint: '' });
      setResourceScope({ scope: 'personal', teamId: null });
      await reposState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '创建仓库失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteArtifactRepo(id);
      Message.success('已删除');
      await reposState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '删除仓库失败'));
    }
  };

  const repoColumns = [
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'repo_type', render: (v: string) => <Tag>{REPO_TYPES[v] || v}</Tag> },
    { title: '端点', dataIndex: 'endpoint', render: (v: string) => v || '—' },
    {
      title: t('admin.mcp.table.scope', { defaultValue: '归属' }),
      key: 'scope',
      render: (_: unknown, record: ArtifactRepo) => (
        <ScopeOwnershipCell
          scope={record.scope}
          teamId={record.team_id}
          createdBy={record.created_by}
          getTeamName={getTeamName}
        />
      ),
    },
    { title: '操作', render: (_: unknown, r: ArtifactRepo) => <Button size='mini' status='danger' icon={<Delete />} onClick={() => Modal.confirm({
      title: '删除制品仓库',
      content: `确定删除「${r.name}」吗？将级联删除该仓库下全部制品，操作不可撤销。`,
      okButtonProps: { status: 'danger' },
      onOk: () => handleDelete(r.id),
    })} /> },
  ];

  const artifactColumns = [
    { title: '名称', dataIndex: 'name' },
    { title: '版本', dataIndex: 'version' },
    { title: '大小', dataIndex: 'file_size', render: (v: number) => v ? `${(v / 1024).toFixed(1)} KB` : '—' },
    { title: '仓库', dataIndex: 'repo_name' },
    { title: '下载', dataIndex: 'download_count' },
    {
      title: t('admin.mcp.table.scope', { defaultValue: '归属' }),
      key: 'scope',
      render: (_: unknown, record: ArtifactRecord) => (
        <ScopeOwnershipCell
          scope={record.scope}
          teamId={record.team_id}
          createdBy={record.created_by}
          getTeamName={getTeamName}
        />
      ),
    },
  ];

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title='CPack 制品管理'
        description='统一管理 Generic / Docker / Maven / AI 模型制品，支持安全扫描与分发'
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => { void reposState.reload(); void artifactsState.reload(); }}>
              刷新
            </Button>
            <Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>
              新建制品仓库
            </Button>
          </>
        }
      />
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-16px'>
        <Card bordered={false} className='rd-12px' title='制品仓库'>
          <ModuleDataState
            loading={reposState.loading}
            error={reposState.error}
            empty={reposState.data.length === 0}
            emptyDescription='暂无仓库'
          >
            <Table
              data={reposState.data}
              rowKey='id'
              columns={repoColumns}
              pagination={false}
              size='small'
              border={false}
            />
          </ModuleDataState>
        </Card>
        <Card bordered={false} className='rd-12px' title='制品列表'>
          <ModuleDataState
            loading={artifactsState.loading}
            error={artifactsState.error}
            empty={artifactsState.data.length === 0}
            emptyDescription='暂无制品'
          >
            <Table
              data={artifactsState.data}
              rowKey='id'
              columns={artifactColumns}
              pagination={false}
              size='small'
              border={false}
            />
          </ModuleDataState>
        </Card>
      </div>
      <Modal title='新建制品仓库' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreate} confirmLoading={saving} okText='创建' cancelText='取消'>
        <Form layout='vertical'>
          <Form.Item label='名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} /></Form.Item>
          <Form.Item label='类型'><Select value={form.repo_type} onChange={(v) => setForm((s) => ({ ...s, repo_type: String(v) }))}>{Object.entries(REPO_TYPES).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}</Select></Form.Item>
          <Form.Item label='端点 URL'><Input value={form.endpoint} onChange={(v) => setForm((s) => ({ ...s, endpoint: v }))} placeholder='https://registry.example.com' /></Form.Item>
          <ResourceScopeFields
            scope={resourceScope.scope}
            teamId={resourceScope.teamId}
            teams={teams}
            isAdmin={isAdmin}
            onChange={setResourceScope}
          />
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default CPackArtifactRepo;
