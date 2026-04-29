/**
 * 用户管理页面 — Admin only
 * 仅在 WebUI 模式（浏览器）下可用
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Message,
  Space,
  Tag,
  Popconfirm,
  Select,
  Spin,
} from '@arco-design/web-react';
import { Add, DeleteFour, Refresh, Key, Link, CloseSmall } from '@icon-park/react';
import { adminApi, kanbanApi, type AdminUser, type AuthProviderId, type KanbanRole } from '@/renderer/utils/kanbanApi';

const ROLE_TAG: Record<KanbanRole, { color: string; label: string }> = {
  admin: { color: 'arcoblue', label: 'Admin' },
  user: { color: 'gray', label: 'User' },
};

const getExternalId = (record: AdminUser, provider: AuthProviderId): string | null => {
  const list = record.identities ?? [];
  const row = list.find((x) => x.provider === provider);
  return row?.external_id ?? null;
};

/** WebUI /kanban/me may return system_admin | org_admin | member while KanbanRole types say admin | user */
function isKanbanAdminRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'org_admin';
}

function meRowForProfile(m: { id: string; username: string; role?: string }): AdminUser {
  const kr: KanbanRole = isKanbanAdminRole(m.role) ? 'admin' : 'user';
  return {
    id: m.id,
    username: m.username,
    role: kr,
    created_at: 0,
    last_login: null,
  };
}

type UsersPageProps = {
  /** full = list all users (after enterprise elevation); profile = current user only */
  enterpriseAccess?: 'full' | 'profile';
};

const UsersPage: React.FC<UsersPageProps> = ({ enterpriseAccess = 'full' }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [me, setMe] = useState<{ role: KanbanRole }>({ role: 'user' });
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [pwdUserId, setPwdUserId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'user' as KanbanRole });
  const [newPwd, setNewPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetEmailCode, setResetEmailCode] = useState('');
  const [resetEmailMasked, setResetEmailMasked] = useState<string | null>(null);
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [bindVisible, setBindVisible] = useState(false);
  const [bindUserId, setBindUserId] = useState<string | null>(null);
  const [bindProvider, setBindProvider] = useState<AuthProviderId>('ldap');
  const [bindExternalId, setBindExternalId] = useState('');

  const loadData = useCallback(async () => {
    const m = await kanbanApi.me().catch(() => ({ id: '', username: '', role: 'user' as KanbanRole }));
    setMe(m);

    if (enterpriseAccess === 'profile') {
      if (!m.id) {
        setUsers([]);
        return;
      }
      setUsers([meRowForProfile(m)]);
      return;
    }

    if (!isKanbanAdminRole(String(m.role))) {
      setUsers([]);
      return;
    }

    const u = await adminApi.listUsers().catch((): AdminUser[] => []);
    setUsers(u ?? []);
  }, [enterpriseAccess]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleCreate = async () => {
    if (!createForm.username.trim() || !createForm.password.trim()) {
      Message.warning('用户名和密码不能为空');
      return;
    }
    setSaving(true);
    try {
      await adminApi.createUser(createForm.username.trim(), createForm.password, createForm.role);
      Message.success('用户已创建');
      setCreateVisible(false);
      setCreateForm({ username: '', password: '', role: 'user' });
      await loadData();
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSetRole = async (id: string, role: KanbanRole) => {
    try {
      await adminApi.setRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      Message.success('角色已更新');
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      Message.success('用户已删除');
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleResetPwd = async () => {
    if (!newPwd.trim()) { Message.warning('密码不能为空'); return; }
    if (!pwdUserId) return;
    const code = resetEmailCode.trim();
    if (!/^\d{6}$/.test(code)) {
      Message.warning('请输入 6 位邮箱验证码');
      return;
    }
    setSaving(true);
    try {
      await adminApi.resetPassword(pwdUserId, newPwd, code);
      Message.success('密码已重置');
      setPwdUserId(null);
      setNewPwd('');
      setResetEmailCode('');
      setResetEmailMasked(null);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '重置失败';
      const codeMap: Record<string, string> = {
        ADMIN_EMAIL_NOT_CONFIGURED: '管理员邮箱未配置，无法发送/验证验证码',
        SMTP_NOT_CONFIGURED: '邮件服务未配置（SMTP），无法发送验证码',
        RESET_CODE_NOT_REQUESTED: '请先发送邮箱验证码',
        RESET_CODE_EXPIRED: '验证码已过期，请重新发送',
        RESET_CODE_ATTEMPTS_EXCEEDED: '验证码尝试次数过多，请重新发送',
        INVALID_RESET_CODE: '验证码错误，请重试',
      };
      Message.error(codeMap[raw] ?? raw);
    } finally {
      setSaving(false);
    }
  };

  const handleSendResetPasswordCode = async () => {
    if (!pwdUserId) return;
    setResetEmailSending(true);
    try {
      const data = await adminApi.sendResetPasswordCode();
      setResetEmailMasked(data.maskedEmail);
      setResetEmailCode('');
      Message.success(`验证码已发送到 ${data.maskedEmail}`);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '发送验证码失败';
      const codeMap: Record<string, string> = {
        ADMIN_EMAIL_NOT_CONFIGURED: '管理员邮箱未配置',
        SMTP_NOT_CONFIGURED: '邮件服务未配置（SMTP）',
        RESET_CODE_RATE_LIMITED: '发送过于频繁，请稍后再试',
      };
      Message.error(codeMap[raw] ?? raw);
    } finally {
      setResetEmailSending(false);
    }
  };

  const openBindModal = (userId: string, provider: AuthProviderId) => {
    setBindUserId(userId);
    setBindProvider(provider);
    setBindExternalId('');
    setBindVisible(true);
  };

  const handleBind = async () => {
    if (!bindUserId) return;
    if (!bindExternalId.trim()) {
      Message.warning('external_id 不能为空');
      return;
    }
    setSaving(true);
    try {
      await adminApi.bindIdentity(bindProvider, bindUserId, bindExternalId.trim());
      Message.success('绑定成功');
      setBindVisible(false);
      setBindUserId(null);
      setBindExternalId('');
      await loadData();
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUnbind = async (userId: string, provider: AuthProviderId) => {
    setSaving(true);
    try {
      await adminApi.unbindIdentity(provider, userId);
      Message.success('解绑成功');
      await loadData();
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : '解绑失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (_: unknown, record: AdminUser) => {
        const cfg = ROLE_TAG[record.role] ?? ROLE_TAG.user;
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (val: number | null | undefined) =>
        val ? new Date(val).toLocaleString() : '未登录',
    },
    {
      title: '绑定',
      key: 'bindings',
      render: (_: unknown, record: AdminUser) => {
        const ldap = getExternalId(record, 'ldap');
        const feishu = getExternalId(record, 'feishu');
        return (
          <Space size='mini' wrap>
            <Tag color={ldap ? 'green' : 'gray'}>{ldap ? `LDAP ✓` : 'LDAP ×'}</Tag>
            <Tag color={feishu ? 'green' : 'gray'}>{feishu ? `飞书 ✓` : '飞书 ×'}</Tag>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: AdminUser) => (
        <Space size='mini'>
          <Select
            size='mini'
            value={record.role}
            onChange={(v) => void handleSetRole(record.id, v as KanbanRole)}
            style={{ width: 80 }}
            disabled={Boolean(record.protected)}
          >
            <Select.Option value='user'>User</Select.Option>
            <Select.Option value='admin'>Admin</Select.Option>
          </Select>
          <Button
            size='mini'
            icon={<Key size={12} />}
            onClick={() => {
              setPwdUserId(record.id);
              setNewPwd('');
              setResetEmailCode('');
              setResetEmailMasked(null);
            }}
            disabled={Boolean(record.protected)}
          >
            重置密码
          </Button>
          {getExternalId(record, 'ldap') ? (
            <Popconfirm title='确认解绑 LDAP？' onOk={() => void handleUnbind(record.id, 'ldap')}>
              <Button size='mini' icon={<CloseSmall size={12} />} disabled={Boolean(record.protected)}>
                解绑LDAP
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size='mini'
              icon={<Link size={12} />}
              onClick={() => openBindModal(record.id, 'ldap')}
              disabled={Boolean(record.protected)}
            >
              绑定LDAP
            </Button>
          )}
          {getExternalId(record, 'feishu') ? (
            <Popconfirm title='确认解绑飞书？' onOk={() => void handleUnbind(record.id, 'feishu')}>
              <Button size='mini' icon={<CloseSmall size={12} />} disabled={Boolean(record.protected)}>
                解绑飞书
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size='mini'
              icon={<Link size={12} />}
              onClick={() => openBindModal(record.id, 'feishu')}
              disabled={Boolean(record.protected)}
            >
              绑定飞书
            </Button>
          )}
          <Popconfirm
            title='确认删除此用户？'
            onOk={() => void handleDelete(record.id)}
            disabled={Boolean(record.protected)}
          >
            <Button size='mini' status='danger' icon={<DeleteFour size={12} />} disabled={Boolean(record.protected)} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const visibleColumns =
    enterpriseAccess === 'profile'
      ? columns.filter((c) => c.key !== 'bindings' && c.key !== 'actions')
      : columns;

  const title =
    enterpriseAccess === 'profile'
      ? '我的账号'
      : '用户管理';

  if (loading) {
    return (
      <div className='p-20px flex items-center justify-center h-full'>
        <Spin tip='加载中...' />
      </div>
    );
  }

  if (enterpriseAccess === 'full' && !isKanbanAdminRole(String(me.role))) {
    return (
      <div className='p-20px flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-tertiary mb-8px'>🔒 权限不足</div>
          <div className='text-13px text-t-tertiary'>仅管理员可访问此页面</div>
        </div>
      </div>
    );
  }

  return (
    <div className='p-20px flex flex-col h-full'>
      <div className='flex items-center justify-between mb-16px'>
        <div className='flex items-center gap-10px'>
          <h2 className='m-0 text-18px font-700 text-t-primary'>{title}</h2>
          {enterpriseAccess === 'full' ? <Tag color='arcoblue' size='small'>Admin</Tag> : <Tag size='small'>只读</Tag>}
        </div>
        <Space>
          <Button size='small' icon={<Refresh theme='outline' />} onClick={() => void loadData()}>刷新</Button>
          {enterpriseAccess === 'full' ? (
            <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={() => setCreateVisible(true)}>
              创建用户
            </Button>
          ) : null}
        </Space>
      </div>

      <Table
        columns={visibleColumns}
        data={users}
        rowKey='id'
        pagination={false}
        size='small'
        border={false}
      />

      {/* 创建用户弹窗 */}
      <Modal
        title='创建用户'
        visible={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreate}
        confirmLoading={saving}
        okText='创建'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='用户名' required>
            <Input
              placeholder='输入用户名'
              value={createForm.username}
              onChange={(v) => setCreateForm((f) => ({ ...f, username: v }))}
            />
          </Form.Item>
          <Form.Item label='初始密码' required>
            <Input.Password
              placeholder='输入初始密码'
              value={createForm.password}
              onChange={(v) => setCreateForm((f) => ({ ...f, password: v }))}
            />
          </Form.Item>
          <Form.Item label='角色'>
            <Select value={createForm.role} onChange={(v) => setCreateForm((f) => ({ ...f, role: v as KanbanRole }))}>
              <Select.Option value='user'>普通用户</Select.Option>
              <Select.Option value='admin'>管理员</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title='重置密码'
        visible={!!pwdUserId}
        onCancel={() => {
          setPwdUserId(null);
          setNewPwd('');
          setResetEmailCode('');
          setResetEmailMasked(null);
        }}
        onOk={handleResetPwd}
        confirmLoading={saving}
        okText='重置'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='新密码' required>
            <Input.Password
              placeholder='输入新密码'
              value={newPwd}
              onChange={setNewPwd}
            />
          </Form.Item>
          <Form.Item label='邮箱验证码' required>
            <Input
              placeholder='请输入 6 位验证码'
              value={resetEmailCode}
              onChange={(v) => setResetEmailCode(String(v ?? ''))}
            />
          </Form.Item>
          <div className='flex items-center justify-between'>
            <div className='text-12px text-t-tertiary'>
              {resetEmailMasked ? `已发送到 ${resetEmailMasked}` : '点击发送获取验证码'}
            </div>
            <Button size='mini' onClick={() => void handleSendResetPasswordCode()} loading={resetEmailSending}>
              发送验证码
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 绑定外部账号弹窗 */}
      <Modal
        title='绑定外部账号'
        visible={bindVisible}
        onCancel={() => { setBindVisible(false); setBindUserId(null); }}
        onOk={handleBind}
        confirmLoading={saving}
        okText='绑定'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='Provider' required>
            <Select value={bindProvider} onChange={(v) => setBindProvider(v as AuthProviderId)}>
              <Select.Option value='ldap'>LDAP</Select.Option>
              <Select.Option value='feishu'>飞书</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label='external_id' required>
            <Input
              placeholder={bindProvider === 'ldap' ? 'DN / entryUUID / objectGUID' : 'union_id / open_id'}
              value={bindExternalId}
              onChange={(v) => setBindExternalId(v)}
            />
          </Form.Item>
          <div className='text-12px text-t-tertiary'>
            说明：按“预创建绑定”策略，LDAP/飞书用户只有在绑定到本地用户后才能登录。
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
