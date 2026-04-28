/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Select, Space, Table, Tag } from '@arco-design/web-react';
import AdminPageWrapper from './components/AdminPageWrapper';

type TeamRow = {
  id: string;
  name: string;
  workspace: string;
  workspace_mode: string;
  user_id: string;
  tenant_id: string;
  created_at: number;
  updated_at: number;
};

type TeamMemberRow = {
  user_id: string;
  username: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: number;
  updated_at: number;
};

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...(opts ?? {}) });
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok || !body?.success) throw new Error(body?.message ?? 'Request failed');
  return body.data as T;
}

const ROLE_TAG: Record<TeamMemberRow['role'], { color: string; label: string }> = {
  owner: { color: 'arcoblue', label: 'Owner' },
  admin: { color: 'green', label: 'Admin' },
  member: { color: 'gray', label: 'Member' },
  viewer: { color: 'orange', label: 'Viewer' },
};

const AdminTeams: React.FC = () => {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createVisible, setCreateVisible] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', workspace: '', workspace_mode: 'shared' });
  const [saving, setSaving] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [addVisible, setAddVisible] = useState(false);
  const [addForm, setAddForm] = useState({ userId: '', role: 'member' as TeamMemberRow['role'] });

  const loadTeams = useCallback(async () => {
    const data = await api<TeamRow[]>('/api/admin/teams');
    setTeams(data ?? []);
  }, []);

  const loadMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true);
    try {
      const data = await api<TeamMemberRow[]>(`/api/admin/teams/${teamId}/members`);
      setMembers(data ?? []);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadTeams()
      .catch((e) => Message.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [loadTeams]);

  const handleCreate = useCallback(async () => {
    if (!createForm.name.trim() || !createForm.workspace.trim()) {
      Message.warning('name/workspace 不能为空');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/admin/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      Message.success('团队已创建');
      setCreateVisible(false);
      setCreateForm({ name: '', workspace: '', workspace_mode: 'shared' });
      await loadTeams();
    } catch (e) {
      Message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }, [createForm, loadTeams]);

  const openTeam = useCallback(
    async (team: TeamRow) => {
      setSelectedTeam(team);
      await loadMembers(team.id);
    },
    [loadMembers]
  );

  const handleAddMember = useCallback(async () => {
    if (!selectedTeam) return;
    if (!addForm.userId.trim()) {
      Message.warning('userId 不能为空');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/admin/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      Message.success('成员已添加/更新');
      setAddVisible(false);
      setAddForm({ userId: '', role: 'member' });
      await loadMembers(selectedTeam.id);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  }, [addForm, loadMembers, selectedTeam]);

  const handleUpdateRole = useCallback(
    async (userId: string, role: TeamMemberRow['role']) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await api(`/api/admin/teams/${selectedTeam.id}/members/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        Message.success('角色已更新');
        await loadMembers(selectedTeam.id);
      } catch (e) {
        Message.error(e instanceof Error ? e.message : '更新失败');
      } finally {
        setSaving(false);
      }
    },
    [loadMembers, selectedTeam]
  );

  const handleRemove = useCallback(
    async (userId: string) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await api(`/api/admin/teams/${selectedTeam.id}/members/${userId}`, { method: 'DELETE' });
        Message.success('成员已移除');
        await loadMembers(selectedTeam.id);
      } catch (e) {
        Message.error(e instanceof Error ? e.message : '移除失败');
      } finally {
        setSaving(false);
      }
    },
    [loadMembers, selectedTeam]
  );

  const memberColumns = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username' },
      {
        title: '角色',
        dataIndex: 'role',
        render: (_: unknown, r: TeamMemberRow) => {
          const cfg = ROLE_TAG[r.role] ?? ROLE_TAG.member;
          return <Tag color={cfg.color}>{cfg.label}</Tag>;
        },
      },
      {
        title: '操作',
        render: (_: unknown, r: TeamMemberRow) => (
          <Space size='mini'>
            <Select size='mini' value={r.role} style={{ width: 110 }} onChange={(v) => void handleUpdateRole(r.user_id, v as any)}>
              <Select.Option value='owner'>Owner</Select.Option>
              <Select.Option value='admin'>Admin</Select.Option>
              <Select.Option value='member'>Member</Select.Option>
              <Select.Option value='viewer'>Viewer</Select.Option>
            </Select>
            <Button size='mini' status='danger' onClick={() => void handleRemove(r.user_id)}>
              移除
            </Button>
          </Space>
        ),
      },
    ],
    [handleRemove, handleUpdateRole]
  );

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'>
        <div className='text-18px font-700 text-t-primary'>团队与权限</div>
        <Space>
          <Button onClick={() => void loadTeams()}>刷新</Button>
          <Button type='primary' onClick={() => setCreateVisible(true)}>
            创建团队
          </Button>
        </Space>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-16px'>
        <Card bordered={false} title='团队列表'>
          <Table
            loading={loading}
            data={teams}
            rowKey='id'
            pagination={false}
            size='small'
            columns={[
              { title: '名称', dataIndex: 'name' },
              { title: '工作区', dataIndex: 'workspace' },
              {
                title: '操作',
                render: (_: unknown, r: TeamRow) => (
                  <Button size='mini' onClick={() => void openTeam(r)}>
                    管理成员
                  </Button>
                ),
              },
            ]}
          />
        </Card>

        <Card
          bordered={false}
          title={selectedTeam ? `成员：${selectedTeam.name}` : '成员'}
          extra={
            selectedTeam ? (
              <Button type='primary' size='small' onClick={() => setAddVisible(true)}>
                添加成员
              </Button>
            ) : null
          }
        >
          {selectedTeam ? (
            <Table
              loading={membersLoading}
              data={members}
              rowKey='user_id'
              pagination={false}
              size='small'
              columns={memberColumns as any}
            />
          ) : (
            <div className='text-t-tertiary text-13px'>从左侧选择一个团队以管理成员</div>
          )}
        </Card>
      </div>

      <Modal
        title='创建团队'
        visible={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreate}
        confirmLoading={saving}
        okText='创建'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='名称' required>
            <Input value={createForm.name} onChange={(v) => setCreateForm((s) => ({ ...s, name: v }))} />
          </Form.Item>
          <Form.Item label='工作区' required>
            <Input value={createForm.workspace} onChange={(v) => setCreateForm((s) => ({ ...s, workspace: v }))} placeholder='例如：D:\\workspace\\teamA' />
          </Form.Item>
          <Form.Item label='workspace_mode'>
            <Select value={createForm.workspace_mode} onChange={(v) => setCreateForm((s) => ({ ...s, workspace_mode: String(v) }))}>
              <Select.Option value='shared'>shared</Select.Option>
              <Select.Option value='isolated'>isolated</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title='添加成员'
        visible={addVisible}
        onCancel={() => setAddVisible(false)}
        onOk={handleAddMember}
        confirmLoading={saving}
        okText='保存'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='userId' required>
            <Input value={addForm.userId} onChange={(v) => setAddForm((s) => ({ ...s, userId: v }))} placeholder='复制用户管理页里的 userId' />
          </Form.Item>
          <Form.Item label='role' required>
            <Select value={addForm.role} onChange={(v) => setAddForm((s) => ({ ...s, role: v as any }))}>
              <Select.Option value='owner'>Owner</Select.Option>
              <Select.Option value='admin'>Admin</Select.Option>
              <Select.Option value='member'>Member</Select.Option>
              <Select.Option value='viewer'>Viewer</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default AdminTeams;

