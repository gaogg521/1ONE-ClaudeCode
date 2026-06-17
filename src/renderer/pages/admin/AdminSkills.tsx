/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Popconfirm, Space, Switch, Table } from '@arco-design/web-react';
import { Delete, Edit, Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  deleteSkill,
  importSkillsBatch,
  listSkills,
  saveSkill,
  type SkillRecord,
} from '@/renderer/utils/enterpriseApi/modules';
import AdminPageWrapper from './components/AdminPageWrapper';
import ModuleDataState from './components/ModuleDataState';
import ModulePageHeader from './components/ModulePageHeader';
import ResourceScopeFields from './components/ResourceScopeFields';
import ScopeOwnershipCell from './components/ScopeOwnershipCell';
import { useTeamNameMap } from '@/renderer/hooks/enterprise/useTeamNameMap';

const AdminSkills: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const role = effectiveRole ?? user?.role;
  const isAdmin = isEnterpriseAdminRole(role);
  const canManageSkill = (record: SkillRecord) =>
    isEnterpriseAdminRole(role) || (user?.id != null && record.created_by === user.id);
  const [modalVisible, setModalVisible] = useState(false);
  const [batchVisible, setBatchVisible] = useState(false);
  const [batchJson, setBatchJson] = useState('');
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    content: '',
    enabled: true,
    scope: 'personal' as string,
    teamId: null as string | null,
  });

  const rowsState = useEnterpriseAsyncData(listSkills, [], t('admin.skills.loadFailed', { defaultValue: '加载失败' }));

  const { getTeamName, teams } = useTeamNameMap();

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', description: '', content: '', enabled: true, scope: 'personal', teamId: null });
    setModalVisible(true);
  };
  const openEdit = (r: SkillRecord) => {
    setEditId(r.id);
    setForm({
      name: r.name,
      description: r.description || '',
      content: r.content || '',
      enabled: r.enabled === 1,
      scope: r.scope || 'personal',
      teamId: r.team_id,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Message.warning(t('admin.skills.nameRequired', { defaultValue: '名称不能为空' }));
      return;
    }
    if (form.scope === 'team' && !form.teamId) {
      Message.warning(t('admin.scope.teamRequired', { defaultValue: '请选择团队' }));
      return;
    }
    setBatchSaving(true);
    try {
      await saveSkill({
        id: editId,
        name: form.name,
        description: form.description,
        content: form.content.trim(),
        enabled: form.enabled,
        scope: form.scope,
        ...(form.scope === 'team' && form.teamId ? { team_id: form.teamId } : {}),
      });
      Message.success(
        editId
          ? t('admin.skills.updated', { defaultValue: '已更新' })
          : t('admin.skills.created', { defaultValue: '已创建' })
      );
      setModalVisible(false);
      await rowsState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, t('admin.skills.saveFailed', { defaultValue: '保存失败' })));
    } finally {
      setBatchSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSkill(id);
      Message.success(t('admin.skills.deleted', { defaultValue: '已删除' }));
      await rowsState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, t('admin.skills.deleteFailed', { defaultValue: '删除失败' })));
    }
  };

  const columns = [
    { title: t('admin.skills.name', { defaultValue: '名称' }), dataIndex: 'name' },
    {
      title: t('admin.skills.description', { defaultValue: '描述' }),
      dataIndex: 'description',
      render: (v: string) => v || '—',
    },
    {
      title: t('admin.skills.scope', { defaultValue: '归属' }),
      dataIndex: 'scope',
      render: (_: unknown, r: SkillRecord) => (
        <ScopeOwnershipCell scope={r.scope} teamId={r.team_id} createdBy={r.created_by} getTeamName={getTeamName} />
      ),
    },
    {
      title: t('admin.skills.enabled', { defaultValue: '启用' }),
      dataIndex: 'enabled',
      render: (_: unknown, r: SkillRecord) =>
        canManageSkill(r) ? (
          <Switch
            size='small'
            checked={r.enabled === 1}
            onChange={async (v) => {
              try {
                await saveSkill({
                  id: r.id,
                  name: r.name,
                  description: r.description,
                  content: r.content,
                  enabled: v,
                  scope: r.scope,
                  ...(r.team_id ? { team_id: r.team_id } : {}),
                });
                await rowsState.reload();
              } catch (error) {
                Message.error(
                  getEnterpriseActionError(error, t('admin.skills.saveFailed', { defaultValue: '保存失败' }))
                );
              }
            }}
          />
        ) : (
          <Switch size='small' checked={r.enabled === 1} disabled />
        ),
    },
    {
      title: t('admin.skills.actions', { defaultValue: '操作' }),
      render: (_: unknown, r: SkillRecord) => (
        <Space size='mini'>
          {canManageSkill(r) ? <Button size='mini' icon={<Edit />} onClick={() => openEdit(r)} /> : null}
          {canManageSkill(r) ? (
            <Popconfirm
              title={t('admin.skills.confirmDelete', { defaultValue: '确定删除？' })}
              onOk={() => void handleDelete(r.id)}
            >
              <Button size='mini' status='danger' icon={<Delete />} />
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title={t('admin.skills.title', { defaultValue: '企业 Skills 技能仓库' })}
        description={t('admin.skills.desc', {
          defaultValue: '统一管理团队 AI 技能。成员可创建个人或团队共享技能，管理员可设为组织共享。',
        })}
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => void rowsState.reload()}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
            <Button
              type='outline'
              onClick={() => {
                setBatchJson(
                  JSON.stringify(
                    [
                      {
                        name: '代码审查Skill',
                        description: '自动审查代码规范和安全',
                        content: '# Code Review Skill\n\n检查: console.log, any类型, XSS, setTimeout(0)',
                      },
                      {
                        name: 'API文档生成Skill',
                        description: '自动生成REST API文档',
                        content: '# API Doc Skill\n\n解析Express路由生成OpenAPI文档',
                      },
                    ],
                    null,
                    2
                  )
                );
                setBatchError(null);
                setBatchVisible(true);
              }}
            >
              {t('admin.skills.batchImport', { defaultValue: '批量导入' })}
            </Button>
            <Button type='primary' icon={<Plus />} onClick={openCreate}>
              {t('admin.skills.create', { defaultValue: '新建技能' })}
            </Button>
          </>
        }
      />
      <Card bordered={false} className='rd-12px'>
        <ModuleDataState
          loading={rowsState.loading}
          error={rowsState.error}
          empty={rowsState.data.length === 0}
          emptyDescription={t('admin.skills.empty', { defaultValue: '暂无技能，点击上方"新建技能"开始创建' })}
        >
          <Table data={rowsState.data} rowKey='id' columns={columns} pagination={false} size='small' border={false} />
        </ModuleDataState>
      </Card>

      <Modal
        title={
          editId
            ? t('admin.skills.editTitle', { defaultValue: '编辑技能' })
            : t('admin.skills.createTitle', { defaultValue: '新建技能' })
        }
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        confirmLoading={batchSaving}
        okText={t('common.confirm', { defaultValue: '确定' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Form layout='vertical'>
          <Form.Item label={t('admin.skills.name', { defaultValue: '名称' })} required>
            <Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
          </Form.Item>
          <Form.Item label={t('admin.skills.description', { defaultValue: '描述' })}>
            <Input value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} />
          </Form.Item>
          <Form.Item label={t('admin.skills.content', { defaultValue: 'Skill 内容 (Markdown)' })}>
            <Input.TextArea
              value={form.content}
              onChange={(v) => setForm((s) => ({ ...s, content: v }))}
              autoSize={{ minRows: 4, maxRows: 12 }}
            />
          </Form.Item>
          <ResourceScopeFields
            scope={form.scope}
            teamId={form.teamId}
            teams={teams}
            isAdmin={isAdmin}
            onChange={({ scope, teamId }) => setForm((s) => ({ ...s, scope, teamId }))}
          />
        </Form>
      </Modal>

      <Modal
        title={t('admin.skills.batchImport', { defaultValue: '批量导入技能 (JSON)' })}
        visible={batchVisible}
        onCancel={() => setBatchVisible(false)}
        onOk={async () => {
          try {
            const items = JSON.parse(batchJson);
            if (!Array.isArray(items)) {
              setBatchError('必须是JSON数组');
              return;
            }
            setBatchSaving(true);
            setBatchError(null);
            try {
              const res = await importSkillsBatch(items);
              Message.success(`成功导入 ${res.count ?? items.length} 个技能`);
              setBatchVisible(false);
              setBatchJson('');
              await rowsState.reload();
            } catch (error) {
              setBatchError(getEnterpriseActionError(error, '导入失败'));
            } finally {
              setBatchSaving(false);
            }
          } catch {
            setBatchError('JSON格式错误');
          }
        }}
        confirmLoading={batchSaving}
        okText={t('common.import', { defaultValue: '导入' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Form layout='vertical'>
          <Form.Item label='JSON (数组)'>
            <Input.TextArea
              value={batchJson}
              onChange={setBatchJson}
              autoSize={{ minRows: 8, maxRows: 20 }}
              placeholder='[{"name":"Skill名称","description":"描述","content":"Markdown内容"},...]'
            />
          </Form.Item>
          {batchError ? <div className='text-13px text-red-500'>{batchError}</div> : null}
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default AdminSkills;
