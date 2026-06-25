/**
 * CCode Code Repository Management
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
  createCodeRepo,
  deleteCodeRepo,
  listCodeRepos,
  type CodeRepo,
} from '@/renderer/utils/enterpriseApi/modules';

const PROVIDERS: Record<string, string> = { gitlab: 'GitLab', github: 'GitHub', gitee: 'Gitee', other: '其他' };

const CCodeRepoList: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const isAdmin = isEnterpriseAdminRole(effectiveRole ?? user?.role);
  const { getTeamName, teams } = useTeamNameMap();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', provider: 'gitlab', credential_id: '', default_branch: 'main' });
  const [resourceScope, setResourceScope] = useState({ scope: 'personal', teamId: null as string | null });
  const [saving, setSaving] = useState(false);
  const reposState = useEnterpriseAsyncData(listCodeRepos, [], '加载代码仓库失败');

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      Message.warning('名称和URL不能为空');
      return;
    }
    if (resourceScope.scope === 'team' && !resourceScope.teamId) {
      Message.warning(t('admin.scope.teamRequired', { defaultValue: '请选择团队' }));
      return;
    }
    setSaving(true);
    try {
      await createCodeRepo({
        ...form,
        scope: resourceScope.scope,
        ...(resourceScope.scope === 'team' && resourceScope.teamId ? { team_id: resourceScope.teamId } : {}),
      });
      Message.success('已绑定');
      setModalVisible(false);
      setForm({ name: '', url: '', provider: 'gitlab', credential_id: '', default_branch: 'main' });
      setResourceScope({ scope: 'personal', teamId: null });
      await reposState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '绑定代码仓库失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCodeRepo(id);
      Message.success('已删除');
      await reposState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '删除代码仓库失败'));
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name' },
    { title: 'URL', dataIndex: 'url', render: (v: string) => <span className='text-12px font-mono text-t-secondary truncate' style={{ maxWidth: 200 }}>{v}</span> },
    { title: '平台', dataIndex: 'provider', render: (v: string) => <Tag color={v === 'gitlab' ? 'orange' : v === 'github' ? 'arcoblue' : 'gray'}>{PROVIDERS[v] || v}</Tag> },
    { title: '默认分支', dataIndex: 'default_branch', render: (v: string) => <Tag size='small'>{v || 'main'}</Tag> },
    {
      title: t('admin.mcp.table.scope', { defaultValue: '归属' }),
      key: 'scope',
      render: (_: unknown, record: CodeRepo) => (
        <ScopeOwnershipCell
          scope={record.scope}
          teamId={record.team_id}
          createdBy={record.created_by}
          getTeamName={getTeamName}
        />
      ),
    },
    { title: '操作', render: (_: unknown, r: CodeRepo) => <Button size='mini' status='danger' icon={<Delete />} onClick={() => Modal.confirm({
      title: '删除代码库',
      content: `确定删除「${r.name}」吗？此操作不可撤销。`,
      okButtonProps: { status: 'danger' },
      onOk: () => handleDelete(r.id),
    })} /> },
  ];

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title='CCode 代码库'
        description='统一绑定 GitLab / GitHub / Gitee 代码仓库，支持 MR 管理与代码搜索'
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => void reposState.reload()}>
              刷新
            </Button>
            <Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>
              绑定代码仓库
            </Button>
          </>
        }
      />
      <Card bordered={false} className='rd-12px'>
        <ModuleDataState
          loading={reposState.loading}
          error={reposState.error}
          empty={reposState.data.length === 0}
          emptyDescription='暂无绑定的代码仓库'
        >
          <Table
            data={reposState.data}
            rowKey='id'
            columns={columns}
            pagination={false}
            size='small'
            border={false}
          />
        </ModuleDataState>
      </Card>
      <Modal title='绑定代码仓库' visible={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleCreate} confirmLoading={saving} okText='绑定' cancelText='取消'>
        <Form layout='vertical'>
          <Form.Item label='名称' required><Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} placeholder='1ONE-Main' /></Form.Item>
          <Form.Item label='仓库 URL' required><Input value={form.url} onChange={(v) => setForm((s) => ({ ...s, url: v }))} placeholder='https://gitlab.com/team/1one.git' /></Form.Item>
          <Form.Item label='平台'><Select value={form.provider} onChange={(v) => setForm((s) => ({ ...s, provider: String(v) }))}>{Object.entries(PROVIDERS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}</Select></Form.Item>
          <Form.Item label='默认分支'><Input value={form.default_branch} onChange={(v) => setForm((s) => ({ ...s, default_branch: v }))} /></Form.Item>
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

export default CCodeRepoList;
