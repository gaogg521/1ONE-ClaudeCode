/**
 * Tasks — 任务看板（团队版）
 * - user: 只看/操作自己的任务
 * - admin: 看全部，可按成员过滤
 * 数据源：Electron → IPC bridge；浏览器 → REST /api/kanban/*
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Button, Badge, Modal, Form, Input, Message, Space, Spin, Select, Tag } from '@arco-design/web-react';
import { Add, Edit, DeleteFour, Refresh, Filter } from '@icon-park/react';
import AionSelect from '@/renderer/components/base/AionSelect';
import { ipcBridge } from '@/common';
import { kanbanApi, type IKanbanTask, type KanbanMe, type IKanbanUser } from '@/renderer/utils/kanbanApi';
import type { TChatConversation } from '@/common/config/storage';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { openAdminConsole } from '@/renderer/utils/openAdminConsole';

type TaskStatus = 'pending' | 'in_progress' | 'completed';
type WorkspaceScope = 'all' | 'personal' | 'team';

function resolveWorkspaceScope(search: string): WorkspaceScope {
  const value = new URLSearchParams(search).get('scope');
  if (value === 'personal' || value === 'team' || value === 'all') {
    return value;
  }
  return 'all';
}

function parseWorkspaceScopeSearch(search: string): {
  teamId: string | null;
  teamName: string | null;
  issueId: string | null;
  issueSubject: string | null;
} {
  const params = new URLSearchParams(search);
  return {
    teamId: params.get('teamId'),
    teamName: params.get('teamName'),
    issueId: params.get('issueId'),
    issueSubject: params.get('issueSubject'),
  };
}

function buildWorkspaceScopePath(pathname: string, search: string, scope: WorkspaceScope): string {
  const params = new URLSearchParams(search);
  params.set('scope', scope);
  return `${pathname}?${params.toString()}`;
}

function buildIssueKanbanPath(
  issueId: string,
  issueSubject: string,
  teamId?: string | null,
  teamName?: string | null
): string {
  const params = new URLSearchParams();
  if (teamId) {
    params.set('teamId', teamId);
  }
  if (teamId && teamName) {
    params.set('teamName', teamName);
  }
  params.set('issueSubject', issueSubject);
  const query = params.toString();
  return query ? `/issues/${encodeURIComponent(issueId)}?${query}` : `/issues/${encodeURIComponent(issueId)}`;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string }> = {
  pending: { label: '待处理', dot: 'var(--color-text-4)' },
  in_progress: { label: '进行中', dot: 'var(--warning)' },
  completed: { label: '已完成', dot: 'var(--success)' },
};

const EMPTY_FORM = {
  subject: '',
  status: 'pending' as TaskStatus,
  active_form: '',
  session_name: '',
  assigned_to: '',
};

function isTeamConversationId(
  conversationId: string | undefined,
  conversations: Map<string, TChatConversation>
): boolean {
  if (!conversationId) return false;
  const conversation = conversations.get(conversationId);
  const extra = conversation?.extra as { teamId?: string } | undefined;
  return Boolean(extra?.teamId);
}

function matchesConversationScope(
  conversation: TChatConversation,
  scope: WorkspaceScope,
  scopedTeamId: string | null
): boolean {
  const extra = conversation.extra as { teamId?: string } | undefined;
  const teamId = extra?.teamId ?? null;
  if (scope === 'personal') {
    return !teamId;
  }
  if (scope === 'team') {
    if (!teamId) return false;
    if (!scopedTeamId) return true;
    return teamId === scopedTeamId;
  }
  return true;
}

function getConversationOpenPath(conversation: TChatConversation): string {
  const extra = conversation.extra as { teamId?: string } | undefined;
  if (extra?.teamId) {
    return `/team/${extra.teamId}`;
  }
  return `/conversation/${conversation.id}`;
}

interface TaskCardProps {
  task: IKanbanTask;
  conversations: Map<string, TChatConversation>;
  users: Map<string, IKanbanUser>;
  me: KanbanMe;
  onEdit: (t: IKanbanTask) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, conversations, users, me, onEdit, onDelete, onStatusChange }) => {
  const navigate = useNavigate();
  const cfg = STATUS_CONFIG[task.status];
  const conv = task.session_name ? conversations.get(task.session_name) : null;
  const assignedUser = task.assigned_to ? users.get(task.assigned_to) : null;
  const owner = users.get(task.user_id);
  const canEdit = me.role === 'admin' || task.user_id === me.id || task.assigned_to === me.id;

  return (
    <div
      className='bg-bg-2 border border-border-1 rd-6px p-10px mb-8px group relative'
      style={{ borderLeft: `3px solid ${cfg.dot}` }}
    >
      <div className='flex items-center gap-6px'>
        <span className='w-7px h-7px rd-full shrink-0' style={{ background: cfg.dot }} />
        <span className='text-13px font-500 flex-1 text-t-primary'>{task.subject}</span>
        {canEdit && (
          <div className='flex items-center gap-4px opacity-0 group-hover:opacity-100 transition-opacity'>
            <AionSelect
              value={task.status}
              size='mini'
              onChange={(v) => onStatusChange(task.id, v as TaskStatus)}
              style={{ width: 72 }}
            >
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
                <AionSelect.Option key={s} value={s}>
                  <span className='text-11px'>{STATUS_CONFIG[s].label}</span>
                </AionSelect.Option>
              ))}
            </AionSelect>
            <Button size='mini' icon={<Edit size={12} />} onClick={() => onEdit(task)} />
            <Button size='mini' status='danger' icon={<DeleteFour size={12} />} onClick={() => onDelete(task.id)} />
          </div>
        )}
      </div>
      {task.active_form && <div className='text-11px mt-4px pl-13px text-[var(--warning)]'>▶ {task.active_form}</div>}
      {conv && (
        <div className='mt-4px pl-13px'>
          <Button
            type='text'
            size='mini'
            className='!p-0 !h-auto text-11px text-t-tertiary'
            onClick={() => navigate(getConversationOpenPath(conv))}
          >
            {`📋 ${conv.name}`}
          </Button>
        </div>
      )}
      <div className='flex items-center gap-8px mt-4px pl-13px flex-wrap'>
        {owner && me.role === 'admin' && owner.id !== me.id && (
          <span className='text-11px text-t-tertiary'>🧑 {owner.username}</span>
        )}
        {assignedUser && (
          <span className='text-11px text-t-tertiary'>
            {task.assigned_to === me.id ? '👉 分配给我' : `👉 ${assignedUser.username}`}
          </span>
        )}
      </div>
    </div>
  );
};

const TasksPage: React.FC = () => {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<IKanbanTask[]>([]);
  const [me, setMe] = useState<KanbanMe>({ id: '', username: '', role: 'user' });
  const [conversations, setConversations] = useState<Map<string, TChatConversation>>(new Map());
  const [users, setUsers] = useState<Map<string, IKanbanUser>>(new Map());
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<IKanbanTask | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<WorkspaceScope>(() => resolveWorkspaceScope(location.search));
  const { hasJoinedEnterprise, isEnterpriseEdition, showTeamsFeature, tenantLabel, showEnterpriseAdminNav } =
    useEditionFeatures();
  const enterpriseMode = useWebuiEnterpriseMode();
  const {
    teamId: scopedTeamId,
    teamName: scopedTeamName,
    issueId: scopedIssueId,
    issueSubject: scopedIssueSubject,
  } = parseWorkspaceScopeSearch(location.search);

  const handleOpenAdminConsole = useCallback(() => {
    void openAdminConsole({
      navigate: (path) => {
        void navigate(path);
      },
      openEnterpriseAdminInBrowser: enterpriseMode.openEnterpriseAdminInBrowser,
    });
  }, [enterpriseMode.openEnterpriseAdminInBrowser, navigate]);

  const loadMe = useCallback(async () => {
    const info = await kanbanApi.me();
    setMe(info);
  }, []);

  const loadTasks = useCallback(async () => {
    const list = await kanbanApi.list();
    setTasks(list ?? []);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await ipcBridge.database.getUserConversations.invoke({ page: 0, pageSize: 1000 });
      setConversations(new Map((convs ?? []).map((c) => [c.id, c])));
    } catch {
      // 浏览器模式下 IPC 不可用，忽略
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const list = await kanbanApi.listUsers();
    setUsers(new Map((list ?? []).map((u) => [u.id, u])));
  }, []);

  // 迁移 localStorage 旧数据
  const migrateLocalStorage = useCallback(async () => {
    try {
      const raw = localStorage.getItem('1one_tasks');
      if (!raw) return;
      const old: IKanbanTask[] = JSON.parse(raw);
      if (!Array.isArray(old) || old.length === 0) return;
      for (const task of old) {
        await kanbanApi.create({
          subject: task.subject,
          status: task.status,
          active_form: task.active_form,
          session_name: task.session_name,
          assigned_to: task.assigned_to,
        });
      }
      localStorage.removeItem('1one_tasks');
    } catch {
      // 迁移失败不影响主流程
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const withTimeout = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), 5000))]);

    const run = async () => {
      try {
        await Promise.race([migrateLocalStorage(), new Promise((_, r) => setTimeout(r, 3000))]);
      } catch {
        /* ignore */
      }
      await Promise.all([
        withTimeout(loadMe(), undefined).catch(() => {}),
        withTimeout(loadTasks(), undefined).catch(() => {}),
        withTimeout(loadConversations(), undefined).catch(() => {}),
        withTimeout(loadUsers(), undefined).catch(() => {}),
      ]);
    };
    run().finally(() => setLoading(false));
  }, [migrateLocalStorage, loadMe, loadTasks, loadConversations, loadUsers]);

  useEffect(() => {
    const nextScope = resolveWorkspaceScope(location.search);
    setScope(!showTeamsFeature && nextScope === 'team' ? 'personal' : nextScope);
  }, [location.search, showTeamsFeature]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      subject: scopedIssueSubject ?? EMPTY_FORM.subject,
      session_name: defaultScopedConversationId,
    });
    setModalVisible(true);
  };

  const openEdit = (t: IKanbanTask) => {
    setEditing(t);
    setForm({
      subject: t.subject,
      status: t.status,
      active_form: t.active_form ?? '',
      session_name: t.session_name ?? '',
      assigned_to: t.assigned_to ?? '',
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!form.subject.trim()) {
      Message.warning('请填写任务名称');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await kanbanApi.update({
          id: editing.id,
          subject: form.subject.trim(),
          status: form.status,
          active_form: form.active_form.trim() || undefined,
          session_name: form.session_name || undefined,
          assigned_to: form.assigned_to || undefined,
        });
        Message.success('任务已更新');
      } else {
        await kanbanApi.create({
          subject: form.subject.trim(),
          status: form.status,
          active_form: form.active_form.trim() || undefined,
          session_name: form.session_name || undefined,
          assigned_to: form.assigned_to || undefined,
        });
        Message.success('任务已创建');
      }
      setModalVisible(false);
      await loadTasks();
    } catch (err) {
      Message.error('操作失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback((id: string) => {
    Modal.confirm({
      title: '删除任务',
      content: '确认删除此任务？',
      onOk: async () => {
        await kanbanApi.remove(id);
        setTasks((prev) => prev.filter((t) => t.id !== id));
        Message.success('任务已删除');
      },
    });
  }, []);

  const handleStatusChange = useCallback(async (id: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status, updated_at: Date.now() } : t)));
    await kanbanApi.update({ id, status });
  }, []);

  const scopeCounts = {
    all: tasks.length,
    personal: tasks.filter((task) => !isTeamConversationId(task.session_name, conversations)).length,
    team: tasks.filter((task) => {
      if (!isTeamConversationId(task.session_name, conversations)) return false;
      if (!scopedTeamId) return true;
      const conversation = task.session_name ? conversations.get(task.session_name) : null;
      const extra = conversation?.extra as { teamId?: string } | undefined;
      return extra?.teamId === scopedTeamId;
    }).length,
  };

  // 过滤逻辑：admin 可按成员过滤
  const visibleTasks = tasks.filter((task) => {
    if (filterUserId && task.user_id !== filterUserId) {
      return false;
    }
    if (scope === 'personal') {
      return !isTeamConversationId(task.session_name, conversations);
    }
    if (scope === 'team') {
      if (!showTeamsFeature) {
        return false;
      }
      if (!isTeamConversationId(task.session_name, conversations)) {
        return false;
      }
      if (!scopedTeamId) {
        return true;
      }
      const conversation = task.session_name ? conversations.get(task.session_name) : null;
      const extra = conversation?.extra as { teamId?: string } | undefined;
      return extra?.teamId === scopedTeamId;
    }
    return true;
  });
  const byStatus = (s: TaskStatus) => visibleTasks.filter((t) => t.status === s);
  const convList = Array.from(conversations.values()).filter((conversation) =>
    matchesConversationScope(conversation, !showTeamsFeature && scope === 'team' ? 'personal' : scope, scopedTeamId)
  );
  const defaultScopedConversationId = scope === 'team' && scopedTeamId ? (convList[0]?.id ?? '') : '';
  const userList = Array.from(users.values());

  const applyScope = (nextScope: WorkspaceScope) => {
    const resolvedScope = !showTeamsFeature && nextScope === 'team' ? 'personal' : nextScope;
    setScope(resolvedScope);
    navigate(buildWorkspaceScopePath(location.pathname, location.search, resolvedScope), { replace: true });
  };

  if (loading) {
    return (
      <div className='p-20px flex items-center justify-center h-full'>
        <Spin tip='加载中...' />
      </div>
    );
  }

  return (
    <div className='p-20px flex flex-col h-full'>
      <div className='flex items-center justify-between mb-16px'>
        <div className='flex items-center gap-10px'>
          <h2 className='m-0 text-18px font-700 text-t-primary'>任务看板</h2>
          {me.role === 'admin' && (
            <Tag color='arcoblue' size='small'>
              Admin
            </Tag>
          )}
        </div>
        <Space>
          {me.role === 'admin' && userList.length > 0 && (
            <AionSelect
              placeholder='全部成员'
              value={filterUserId || undefined}
              onChange={(v) => setFilterUserId((v as string) ?? '')}
              allowClear
              style={{ width: 120 }}
              size='small'
            >
              {userList.map((u) => (
                <AionSelect.Option key={u.id} value={u.id}>
                  {u.username}
                </AionSelect.Option>
              ))}
            </AionSelect>
          )}
          <Button
            size='small'
            icon={<Refresh theme='outline' />}
            onClick={() => void Promise.all([loadTasks(), loadUsers()])}
          >
            刷新
          </Button>
          <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={openAdd}>
            ＋新任务
          </Button>
        </Space>
      </div>

      {hasJoinedEnterprise ? (
        <div className='mb-16px p-12px rd-10px border border-border-2 bg-fill-1 flex items-center justify-between gap-12px flex-wrap'>
          <div className='min-w-0 flex-1'>
            <div className='text-14px font-600 text-t-primary mb-4px'>
              {t('common.workspace.hub.enterpriseTitle', {
                defaultValue: '企业协同与平台能力',
              })}
            </div>
            <div className='text-12px text-t-tertiary leading-relaxed'>
              {auth.status === 'authenticated'
                ? t('common.workspace.hub.enterpriseDesc', {
                    defaultValue:
                      '已加入 {{tenant}}。现在可以从主工作台直接进入企业协同与平台能力，不必先切到独立管理页。',
                    tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' }),
                  })
                : t('common.workspace.hub.enterpriseInstanceDesc', {
                    defaultValue:
                      '当前实例已接入 {{tenant}}。登录企业账号后，即可从主工作台直接进入企业协同与平台能力。',
                    tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' }),
                  })}
            </div>
          </div>
          <div className='flex items-center gap-8px flex-wrap'>
            <Tag size='small' color={isEnterpriseEdition ? 'arcoblue' : 'gray'}>
              {isEnterpriseEdition
                ? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' })
                : t('settings.edition.personal', { defaultValue: '个人版' })}
            </Tag>
            {tenantLabel ? (
              <Tag size='small' color='green'>
                {tenantLabel}
              </Tag>
            ) : null}
            <Button size='small' onClick={() => navigate('/workspace')}>
              {t('common.workspace.hub.enterpriseOverviewTitle', {
                defaultValue: '企业能力总览',
              })}
            </Button>
            {showEnterpriseAdminNav ? (
              <Button size='small' type='outline' onClick={handleOpenAdminConsole}>
                {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showTeamsFeature ? (
        <div className='mb-16px flex items-center justify-between gap-12px flex-wrap'>
          <div className='text-12px text-t-tertiary'>
            {t('common.workspace.scopeHint', {
              defaultValue: '切换查看个人工作内容与团队协同范围。',
            })}
          </div>
          <div className='flex items-center gap-8px flex-wrap'>
            <Button size='small' type={scope === 'all' ? 'primary' : 'outline'} onClick={() => applyScope('all')}>
              {t('common.workspace.scopeAll', { defaultValue: '全部' })}
            </Button>
            <Tag size='small' color='gray'>
              {scopeCounts.all}
            </Tag>
            <Button
              size='small'
              type={scope === 'personal' ? 'primary' : 'outline'}
              onClick={() => applyScope('personal')}
            >
              {t('common.workspace.scopePersonal', { defaultValue: '个人' })}
            </Button>
            <Tag size='small' color='gray'>
              {scopeCounts.personal}
            </Tag>
            <Button size='small' type={scope === 'team' ? 'primary' : 'outline'} onClick={() => applyScope('team')}>
              {t('common.workspace.scopeTeam', { defaultValue: '团队协同' })}
            </Button>
            <Tag size='small' color='gray'>
              {scopeCounts.team}
            </Tag>
            {scope === 'team' && scopedTeamName ? (
              <Tag size='small' color='purple'>
                {scopedTeamName}
              </Tag>
            ) : null}
            {scope === 'team' && scopedTeamId ? (
              <Button size='small' type='outline' onClick={() => navigate(`/team/${scopedTeamId}`)}>
                {t('team.backToCurrentTeam', { defaultValue: '返回当前团队' })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {scope === 'team' && scopedTeamId ? (
        <div className='mb-16px text-12px text-t-tertiary'>
          {t('common.workspace.scopeTeamTaskCreateHint', {
            defaultValue: '当前团队视图中新建任务会默认关联到这个团队范围里的会话。',
          })}
        </div>
      ) : null}

      {scopedIssueId && scopedIssueSubject ? (
        <div className='mb-16px rounded-10px border border-border-2 bg-fill-1 p-12px'>
          <div className='text-12px text-t-tertiary'>
            {t('common.workspace.issueContextHint', {
              defaultValue: '当前来自超级助手 Issue：{{subject}}',
              subject: scopedIssueSubject,
            })}
          </div>
          <div className='mt-8px flex items-center gap-8px flex-wrap'>
            <Button size='small' type='primary' onClick={openAdd}>
              {t('common.workspace.issueCreateTaskDraft', {
                defaultValue: '基于当前 Issue 新建任务',
              })}
            </Button>
            <Button
              size='small'
              type='outline'
              onClick={() =>
                navigate(buildIssueKanbanPath(scopedIssueId, scopedIssueSubject, scopedTeamId, scopedTeamName))
              }
            >
              {t('common.workspace.issueOpenKanban', {
                defaultValue: '打开当前 Issue 看板',
              })}
            </Button>
          </div>
        </div>
      ) : null}

      <div className='flex gap-20px flex-1 overflow-hidden'>
        {(['pending', 'in_progress', 'completed'] as TaskStatus[]).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const col = byStatus(s);
          return (
            <div key={s} className='flex-1 min-w-0 flex flex-col'>
              <div className='flex items-center gap-8px mb-12px pb-8px border-b border-border-1'>
                <span className='font-600 text-13px text-t-primary'>{cfg.label}</span>
                <Badge count={col.length} style={{ background: cfg.dot }} />
              </div>
              <div className='flex-1 overflow-y-auto'>
                {col.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    conversations={conversations}
                    users={users}
                    me={me}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))}
                {col.length === 0 && <div className='text-12px text-t-tertiary text-center py-16px'>暂无任务</div>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={editing ? '编辑任务' : '新建任务'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText='保存'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='任务名称' required>
            <Input
              placeholder='例如: 修复登录 Bug'
              value={form.subject}
              onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
            />
          </Form.Item>
          <Form.Item label='状态'>
            <AionSelect value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}>
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
                <AionSelect.Option key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </AionSelect.Option>
              ))}
            </AionSelect>
          </Form.Item>
          <Form.Item label='当前进度 (可选)'>
            <Input
              placeholder='例如: 正在分析代码'
              value={form.active_form}
              onChange={(v) => setForm((f) => ({ ...f, active_form: v }))}
            />
          </Form.Item>
          <Form.Item label='关联会话 (可选)'>
            <AionSelect
              placeholder={convList.length ? '选择会话' : '暂无会话'}
              value={form.session_name || undefined}
              onChange={(v) => setForm((f) => ({ ...f, session_name: (v as string) ?? '' }))}
              allowClear
              showSearch
              filterOption={(inputVal, option) => {
                const label = String((option as { props?: { children?: unknown } })?.props?.children ?? '');
                return label.toLowerCase().includes(inputVal.toLowerCase());
              }}
            >
              {convList.map((conv) => (
                <AionSelect.Option key={conv.id} value={conv.id}>
                  {conv.name}
                </AionSelect.Option>
              ))}
            </AionSelect>
          </Form.Item>
          <Form.Item label='分配给 (可选)'>
            <AionSelect
              placeholder={userList.length ? '选择负责人' : '暂无用户'}
              value={form.assigned_to || undefined}
              onChange={(v) => setForm((f) => ({ ...f, assigned_to: (v as string) ?? '' }))}
              allowClear
            >
              {userList.map((user) => (
                <AionSelect.Option key={user.id} value={user.id}>
                  {user.username}
                </AionSelect.Option>
              ))}
            </AionSelect>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TasksPage;
