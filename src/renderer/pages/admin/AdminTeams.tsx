/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Popconfirm, Select, Space, Table, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  addTeamMember,
  createTeam,
  createTeamTask,
  deleteTeamTask,
  listTeamMembers,
  listTeams,
  listTeamTasks,
  removeTeamMember,
  type TeamMemberRecord,
  type TeamRecord,
  type TeamTaskRecord,
  updateTeamMemberRole,
  updateTeamTask,
} from '@/renderer/utils/enterpriseApi/modules';
import AdminPageWrapper from './components/AdminPageWrapper';
import ModuleDataState from './components/ModuleDataState';
import ModulePageHeader from './components/ModulePageHeader';
import TeamAddMemberModal, { type TeamMemberRole } from './components/TeamAddMemberModal';

type TeamRow = TeamRecord;
type TeamMemberRow = TeamMemberRecord;
type TeamTaskRow = TeamTaskRecord;

const ROLE_TAG: Record<TeamMemberRow['role'], { color: string; label: string }> = {
  owner: { color: 'arcoblue', label: 'Owner' },
  admin: { color: 'green', label: 'Admin' },
  member: { color: 'gray', label: 'Member' },
  viewer: { color: 'orange', label: 'Viewer' },
};

const AdminTeams: React.FC = () => {
  const { t } = useTranslation();
  const [createVisible, setCreateVisible] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', workspace: '', workspace_mode: 'shared' });
  const [saving, setSaving] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [taskForm, setTaskForm] = useState({ subject: '', description: '', owner: '' });

  const [addVisible, setAddVisible] = useState(false);

  const teamsState = useEnterpriseAsyncData(
    listTeams,
    [],
    t('admin.teams.messages.loadFailed', { defaultValue: '加载失败' })
  );
  const membersState = useEnterpriseAsyncData(
    useCallback(async () => {
      if (!selectedTeam) {
        return [];
      }
      return listTeamMembers(selectedTeam.id);
    }, [selectedTeam]),
    [],
    t('admin.teams.messages.operationFailed', { defaultValue: '加载成员失败' })
  );
  const tasksState = useEnterpriseAsyncData(
    useCallback(async () => {
      if (!selectedTeam) {
        return [];
      }
      return listTeamTasks(selectedTeam.id);
    }, [selectedTeam]),
    [],
    t('admin.teams.messages.loadTasksFailed', { defaultValue: '加载团队任务失败' })
  );

  useEffect(() => {
    if (!selectedTeam) {
      return;
    }
    const nextSelectedTeam = teamsState.data.find((team) => team.id === selectedTeam.id) ?? null;
    if (nextSelectedTeam === null) {
      setSelectedTeam(null);
      return;
    }
    if (nextSelectedTeam !== selectedTeam) {
      setSelectedTeam(nextSelectedTeam);
    }
  }, [selectedTeam, teamsState.data]);

  const handleCreate = useCallback(async () => {
    if (!createForm.name.trim() || !createForm.workspace.trim()) {
      Message.warning(t('admin.teams.validation.nameWorkspaceRequired', { defaultValue: 'name/workspace 不能为空' }));
      return;
    }
    setSaving(true);
    try {
      await createTeam({
        name: createForm.name.trim(),
        workspace: createForm.workspace.trim(),
        workspace_mode: createForm.workspace_mode,
      });
      Message.success(t('admin.teams.messages.created', { defaultValue: '团队已创建' }));
      setCreateVisible(false);
      setCreateForm({ name: '', workspace: '', workspace_mode: 'shared' });
      await teamsState.reload();
    } catch (e) {
      Message.error(getEnterpriseActionError(e, t('admin.teams.messages.createFailed', { defaultValue: '创建失败' })));
    } finally {
      setSaving(false);
    }
  }, [createForm, t, teamsState]);

  const handleCreateTeamTask = useCallback(async () => {
    if (!selectedTeam || !taskForm.subject.trim()) {
      Message.warning(t('admin.teams.validation.taskSubjectRequired', { defaultValue: '请填写任务标题' }));
      return;
    }
    setSaving(true);
    try {
      await createTeamTask({
        teamId: selectedTeam.id,
        subject: taskForm.subject.trim(),
        description: taskForm.description.trim() ? taskForm.description.trim() : null,
        owner: taskForm.owner.trim() ? taskForm.owner.trim() : null,
      });
      Message.success(t('admin.teams.messages.taskCreated', { defaultValue: '任务已创建' }));
      setTaskModalVisible(false);
      setTaskForm({ subject: '', description: '', owner: '' });
      await tasksState.reload();
    } catch (e) {
      Message.error(getEnterpriseActionError(e, t('admin.teams.messages.createFailed', { defaultValue: '创建失败' })));
    } finally {
      setSaving(false);
    }
  }, [selectedTeam, t, taskForm, tasksState]);

  const handleDeleteTeamTask = useCallback(
    async (taskId: string) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await deleteTeamTask(taskId);
        Message.success(t('admin.teams.messages.deleted', { defaultValue: '已删除' }));
        await tasksState.reload();
      } catch (e) {
        Message.error(getEnterpriseActionError(e, t('admin.teams.messages.deleteFailed', { defaultValue: '删除失败' })));
      } finally {
        setSaving(false);
      }
    },
    [selectedTeam, t, tasksState]
  );

  const handleTeamTaskStatus = useCallback(
    async (taskId: string, status: string) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await updateTeamTask(taskId, { status });
        await tasksState.reload();
      } catch (e) {
        Message.error(getEnterpriseActionError(e, t('admin.teams.messages.updateFailed', { defaultValue: '更新失败' })));
      } finally {
        setSaving(false);
      }
    },
    [selectedTeam, t, tasksState]
  );

  const memberUserIds = useMemo(() => new Set(membersState.data.map((m) => m.user_id)), [membersState.data]);

  const handleAddMember = useCallback(
    async (userId: string, role: TeamMemberRole) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await addTeamMember(selectedTeam.id, {
          userId,
          role,
        });
        Message.success(t('admin.teams.messages.memberAdded', { defaultValue: '成员已添加/更新' }));
        setAddVisible(false);
        await membersState.reload();
      } catch (e) {
        Message.error(getEnterpriseActionError(e, t('admin.teams.messages.operationFailed', { defaultValue: '操作失败' })));
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [membersState, selectedTeam, t]
  );

  const handleUpdateRole = useCallback(
    async (userId: string, role: TeamMemberRow['role']) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await updateTeamMemberRole(selectedTeam.id, userId, { role });
        Message.success(t('admin.teams.messages.roleUpdated', { defaultValue: '角色已更新' }));
        await membersState.reload();
      } catch (e) {
        Message.error(getEnterpriseActionError(e, t('admin.teams.messages.updateFailed', { defaultValue: '更新失败' })));
      } finally {
        setSaving(false);
      }
    },
    [membersState, selectedTeam, t]
  );

  const handleRemove = useCallback(
    async (userId: string) => {
      if (!selectedTeam) return;
      setSaving(true);
      try {
        await removeTeamMember(selectedTeam.id, userId);
        Message.success(t('admin.teams.messages.memberRemoved', { defaultValue: '成员已移除' }));
        await membersState.reload();
      } catch (e) {
        Message.error(getEnterpriseActionError(e, t('admin.teams.messages.removeFailed', { defaultValue: '移除失败' })));
      } finally {
        setSaving(false);
      }
    },
    [membersState, selectedTeam, t]
  );

  const memberColumns = useMemo(
    () => [
      { title: t('admin.teams.table.username', { defaultValue: '用户名' }), dataIndex: 'username' },
      {
        title: t('admin.teams.table.role', { defaultValue: '角色' }),
        dataIndex: 'role',
        render: (_: unknown, r: TeamMemberRow) => {
          const cfg = ROLE_TAG[r.role] ?? ROLE_TAG.member;
          return <Tag color={cfg.color}>{cfg.label}</Tag>;
        },
      },
      {
        title: t('admin.teams.table.actions', { defaultValue: '操作' }),
        render: (_: unknown, r: TeamMemberRow) => (
          <Space size='mini'>
            <Select size='mini' value={r.role} style={{ width: 110 }} onChange={(v) => void handleUpdateRole(r.user_id, v as any)}>
              <Select.Option value='owner'>Owner</Select.Option>
              <Select.Option value='admin'>Admin</Select.Option>
              <Select.Option value='member'>Member</Select.Option>
              <Select.Option value='viewer'>Viewer</Select.Option>
            </Select>
            <Button size='mini' status='danger' onClick={() => void handleRemove(r.user_id)}>
              {t('admin.teams.button.remove', { defaultValue: '移除' })}
            </Button>
          </Space>
        ),
      },
    ],
    [handleRemove, handleUpdateRole, t]
  );

  const taskColumns = useMemo(
    () => [
      { title: t('admin.teams.table.taskTitle', { defaultValue: '标题' }), dataIndex: 'subject' },
      {
        title: t('admin.teams.table.status', { defaultValue: '状态' }),
        dataIndex: 'status',
        render: (_: unknown, r: TeamTaskRow) => (
          <Select
            size='mini'
            value={r.status}
            style={{ width: 130 }}
            onChange={(v) => void handleTeamTaskStatus(r.id, String(v))}
          >
            <Select.Option value='pending'>pending</Select.Option>
            <Select.Option value='in_progress'>in_progress</Select.Option>
            <Select.Option value='done'>done</Select.Option>
            <Select.Option value='cancelled'>cancelled</Select.Option>
          </Select>
        ),
      },
      {
        title: t('admin.teams.table.owner', { defaultValue: '负责人' }),
        dataIndex: 'owner',
        render: (v: unknown) => (typeof v === 'string' && v ? v : '—'),
      },
      {
        title: t('admin.teams.table.actions', { defaultValue: '操作' }),
        render: (_: unknown, r: TeamTaskRow) => (
          <Popconfirm title={t('admin.teams.confirm.deleteTask', { defaultValue: '确定删除该任务？' })} onOk={() => void handleDeleteTeamTask(r.id)}>
            <Button size='mini' status='danger'>
              {t('admin.teams.button.delete', { defaultValue: '删除' })}
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [handleDeleteTeamTask, handleTeamTaskStatus, t]
  );

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title={t('admin.teams.page.title', { defaultValue: '团队与权限' })}
        description={t('admin.teams.pageDesc', {
          defaultValue: '管理企业团队、成员角色与协同任务，作为 CTeam 的组织与执行入口。',
        })}
        actions={
          <>
          <Button onClick={() => void teamsState.reload()}>{t('admin.teams.button.refresh', { defaultValue: '刷新' })}</Button>
          <Button type='primary' onClick={() => setCreateVisible(true)}>
            {t('admin.teams.button.createTeam', { defaultValue: '创建团队' })}
          </Button>
          </>
        }
      />

      <div className='grid grid-cols-1 md:grid-cols-2 gap-16px'>
        <Card bordered={false} title={t('admin.teams.card.teamList', { defaultValue: '团队列表' })}>
          <ModuleDataState
            loading={teamsState.loading}
            error={teamsState.error}
            empty={teamsState.data.length === 0}
            emptyDescription={t('admin.teams.empty', { defaultValue: '暂无团队，请先创建团队。' })}
          >
            <Table
              data={teamsState.data}
              rowKey='id'
              pagination={false}
              size='small'
              columns={[
                { title: t('admin.teams.table.name', { defaultValue: '名称' }), dataIndex: 'name' },
                { title: t('admin.teams.table.workspace', { defaultValue: '工作区' }), dataIndex: 'workspace' },
                {
                  title: t('admin.teams.table.actions', { defaultValue: '操作' }),
                  render: (_: unknown, r: TeamRow) => (
                    <Button size='mini' onClick={() => setSelectedTeam(r)}>
                      {t('admin.teams.button.manageMembers', { defaultValue: '管理成员' })}
                    </Button>
                  ),
                },
              ]}
            />
          </ModuleDataState>
        </Card>

        <Card
          bordered={false}
          title={selectedTeam ? t('admin.teams.card.membersOf', { defaultValue: '成员：{{name}}', name: selectedTeam.name }) : t('admin.teams.card.members', { defaultValue: '成员' })}
          extra={
            selectedTeam ? (
              <Button type='primary' size='small' onClick={() => setAddVisible(true)}>
                {t('admin.teams.button.addMember', { defaultValue: '添加成员' })}
              </Button>
            ) : null
          }
        >
          {selectedTeam ? (
            <ModuleDataState
              loading={membersState.loading}
              error={membersState.error}
              empty={membersState.data.length === 0}
              emptyDescription={t('admin.teams.emptyMembers', { defaultValue: '当前团队暂无成员。' })}
            >
              <Table
                data={membersState.data}
                rowKey='user_id'
                pagination={false}
                size='small'
                columns={memberColumns as any}
              />
            </ModuleDataState>
          ) : (
            <div className='text-t-tertiary text-13px'>{t('admin.teams.placeholder.selectTeam', { defaultValue: '从左侧选择一个团队以管理成员' })}</div>
          )}
        </Card>
      </div>

      {selectedTeam ? (
        <Card
          bordered={false}
          className='mt-16px'
          title={t('admin.teams.card.tasksOf', { defaultValue: '团队任务：{{name}}', name: selectedTeam.name })}
          extra={
            <Space>
              <Button size='small' onClick={() => void tasksState.reload()}>
                {t('admin.teams.button.refresh', { defaultValue: '刷新' })}
              </Button>
              <Button type='primary' size='small' onClick={() => setTaskModalVisible(true)}>
                {t('admin.teams.button.createTask', { defaultValue: '新建任务' })}
              </Button>
            </Space>
          }
        >
          <ModuleDataState
            loading={tasksState.loading}
            error={tasksState.error}
            empty={tasksState.data.length === 0}
            emptyDescription={t('admin.teams.emptyTasks', { defaultValue: '当前团队暂无任务。' })}
          >
            <Table
              data={tasksState.data}
              rowKey='id'
              pagination={false}
              size='small'
              columns={taskColumns as any}
            />
          </ModuleDataState>
        </Card>
      ) : null}

      <Modal
        title={t('admin.teams.modal.createTeam', { defaultValue: '创建团队' })}
        visible={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreate}
        confirmLoading={saving}
        okText={t('admin.teams.button.create', { defaultValue: '创建' })}
        cancelText={t('admin.teams.button.cancel', { defaultValue: '取消' })}
      >
        <Form layout='vertical'>
          <Form.Item label={t('admin.teams.form.name', { defaultValue: '名称' })} required>
            <Input value={createForm.name} onChange={(v) => setCreateForm((s) => ({ ...s, name: v }))} />
          </Form.Item>
          <Form.Item label={t('admin.teams.form.workspace', { defaultValue: '工作区' })} required>
            <Input value={createForm.workspace} onChange={(v) => setCreateForm((s) => ({ ...s, workspace: v }))} placeholder={t('admin.teams.form.workspacePlaceholder', { defaultValue: '例如：D:\\workspace\\teamA' })} />
          </Form.Item>
          <Form.Item label={t('admin.teams.form.workspaceMode', { defaultValue: '工作区模式' })}>
            <Select value={createForm.workspace_mode} onChange={(v) => setCreateForm((s) => ({ ...s, workspace_mode: String(v) }))}>
              <Select.Option value='shared'>shared</Select.Option>
              <Select.Option value='isolated'>isolated</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('admin.teams.modal.createTask', { defaultValue: '新建团队任务' })}
        visible={taskModalVisible}
        onCancel={() => setTaskModalVisible(false)}
        onOk={handleCreateTeamTask}
        confirmLoading={saving}
        okText={t('admin.teams.button.create', { defaultValue: '创建' })}
        cancelText={t('admin.teams.button.cancel', { defaultValue: '取消' })}
      >
        <Form layout='vertical'>
          <Form.Item label={t('admin.teams.form.taskTitle', { defaultValue: '标题' })} required>
            <Input value={taskForm.subject} onChange={(v) => setTaskForm((s) => ({ ...s, subject: v }))} />
          </Form.Item>
          <Form.Item label={t('admin.teams.form.description', { defaultValue: '描述' })}>
            <Input.TextArea
              value={taskForm.description}
              onChange={(v) => setTaskForm((s) => ({ ...s, description: v }))}
              autoSize={{ minRows: 2, maxRows: 8 }}
            />
          </Form.Item>
          <Form.Item label={t('admin.teams.form.ownerUserId', { defaultValue: '负责人 userId（可选）' })}>
            <Input
              value={taskForm.owner}
              onChange={(v) => setTaskForm((s) => ({ ...s, owner: v }))}
              placeholder={t('admin.teams.form.ownerPlaceholder', { defaultValue: '对应用户管理中的 user id' })}
            />
          </Form.Item>
        </Form>
      </Modal>

      <TeamAddMemberModal
        visible={addVisible}
        confirmLoading={saving}
        memberUserIds={memberUserIds}
        onCancel={() => setAddVisible(false)}
        onConfirm={handleAddMember}
      />
    </AdminPageWrapper>
  );
};

export default AdminTeams;

