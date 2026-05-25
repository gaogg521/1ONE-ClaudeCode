/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Message, Modal, Radio, Select, Space, Spin, Table } from '@arco-design/web-react';
import { adminApi, type AdminUser } from '@/renderer/utils/kanbanApi';
import {
  enterpriseGet,
  enterpriseMutate,
  getEnterpriseActionError,
} from '@/renderer/utils/enterpriseApi/client';

export type TeamMemberRole = 'owner' | 'admin' | 'member' | 'viewer';

type LdapDirectoryEntry = {
  dn: string;
  username: string;
  displayName?: string;
  mail?: string;
};

type TeamAddMemberModalProps = {
  visible: boolean;
  confirmLoading: boolean;
  memberUserIds: Set<string>;
  onCancel: () => void;
  onConfirm: (userId: string, role: TeamMemberRole) => Promise<void>;
};

const ROLE_OPTIONS: Array<{ value: TeamMemberRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

const TeamAddMemberModal: React.FC<TeamAddMemberModalProps> = ({
  visible,
  confirmLoading,
  memberUserIds,
  onCancel,
  onConfirm,
}) => {
  const [source, setSource] = useState<'local' | 'ldap'>('local');
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [localUserId, setLocalUserId] = useState('');
  const [role, setRole] = useState<TeamMemberRole>('member');

  const [ldapQuery, setLdapQuery] = useState('');
  const [ldapSearching, setLdapSearching] = useState(false);
  const [ldapResults, setLdapResults] = useState<LdapDirectoryEntry[]>([]);
  const [selectedLdapDn, setSelectedLdapDn] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSource('local');
    setLocalUserId('');
    setRole('member');
    setLdapQuery('');
    setLdapResults([]);
    setSelectedLdapDn('');

    setUsersLoading(true);
    Promise.all([
      adminApi.listUsers(),
      enterpriseGet<{ enabled: number }>('/api/admin/auth/providers/ldap').catch(() => ({ enabled: 0 })),
    ])
      .then(([users, ldap]) => {
        setAdminUsers(users ?? []);
        setLdapEnabled(Boolean(ldap?.enabled));
      })
      .catch((e) => {
        Message.error(getEnterpriseActionError(e, '加载用户列表失败'));
      })
      .finally(() => setUsersLoading(false));
  }, [visible]);

  const localOptions = useMemo(() => {
    return adminUsers
      .filter((u) => !memberUserIds.has(u.id) && !u.protected)
      .map((u) => {
        const ldapId = u.identities?.find((i) => i.provider === 'ldap')?.external_id;
        const suffix = ldapId ? ' · LDAP' : '';
        return {
          value: u.id,
          label: `${u.username}${suffix}`,
        };
      });
  }, [adminUsers, memberUserIds]);

  const handleLdapSearch = useCallback(async () => {
    const q = ldapQuery.trim();
    if (!q) {
      Message.warning('请输入姓名、账号或邮箱关键词');
      return;
    }
    setLdapSearching(true);
    try {
      const data = await enterpriseMutate<LdapDirectoryEntry[]>(
        '/api/admin/ldap/users/search',
        'POST',
        { query: q, limit: 30 }
      );
      setLdapResults(data ?? []);
      setSelectedLdapDn('');
      if (!data?.length) {
        Message.info('未找到匹配的目录用户');
      }
    } catch (e) {
      Message.error(getEnterpriseActionError(e, 'LDAP 搜索失败'));
      setLdapResults([]);
    } finally {
      setLdapSearching(false);
    }
  }, [ldapQuery]);

  const handleOk = useCallback(async () => {
    try {
      if (source === 'local') {
        if (!localUserId) {
          Message.warning('请选择用户');
          return;
        }
        await onConfirm(localUserId, role);
        return;
      }

      const entry = ldapResults.find((r) => r.dn === selectedLdapDn);
      if (!entry) {
        Message.warning('请先从 LDAP 搜索结果中选择一名用户');
        return;
      }

      const resolved = await enterpriseMutate<{ userId: string; username: string; created: boolean }>(
        '/api/admin/ldap/users/resolve',
        'POST',
        { dn: entry.dn, username: entry.username }
      );
      if (memberUserIds.has(resolved.userId)) {
        Message.warning(`${resolved.username} 已是团队成员`);
        return;
      }
      await onConfirm(resolved.userId, role);
      if (resolved.created) {
        Message.info(`已创建本地账号「${resolved.username}」并绑定 LDAP`);
      }
    } catch (e) {
      Message.error(getEnterpriseActionError(e, '添加成员失败'));
    }
  }, [ldapResults, localUserId, memberUserIds, onConfirm, role, selectedLdapDn, source]);

  const ldapColumns = useMemo(
    () => [
      {
        title: '姓名',
        render: (_: unknown, r: LdapDirectoryEntry) => (
          <div className='text-t-primary'>{r.displayName || r.username}</div>
        ),
      },
      {
        title: '登录名',
        dataIndex: 'username',
        render: (v: unknown) => <span className='font-mono text-12px'>{String(v ?? '')}</span>,
      },
      {
        title: '邮箱',
        dataIndex: 'mail',
        render: (v: unknown) => (typeof v === 'string' && v ? v : '—'),
      },
    ],
    []
  );

  return (
    <Modal
      title='添加成员'
      visible={visible}
      onCancel={onCancel}
      onOk={() => void handleOk()}
      confirmLoading={confirmLoading}
      okText='保存'
      cancelText='取消'
      style={{ width: 560 }}
    >
      <Spin loading={usersLoading}>
        <Form layout='vertical'>
          <Form.Item label='用户来源'>
            <Radio.Group value={source} onChange={(v) => setSource(v as 'local' | 'ldap')}>
              <Radio value='local'>企业本地用户</Radio>
              <Radio value='ldap' disabled={!ldapEnabled}>
                LDAP 目录{ldapEnabled ? '' : '（未启用）'}
              </Radio>
            </Radio.Group>
          </Form.Item>

          {source === 'local' ? (
            <Form.Item label='选择用户' required>
              <Select
                showSearch
                allowClear
                placeholder='搜索用户名…'
                value={localUserId || undefined}
                onChange={(v) => setLocalUserId(String(v ?? ''))}
                notFoundContent={usersLoading ? <Spin size={16} /> : '暂无可添加用户（请先在「用户与成员」创建）'}
              >
                {localOptions.map((o) => (
                  <Select.Option key={o.value} value={o.value}>
                    {o.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <>
              <Form.Item label='搜索 LDAP'>
                <Space className='w-full'>
                  <Input
                    className='flex-1'
                    value={ldapQuery}
                    onChange={setLdapQuery}
                    placeholder='姓名 / sAMAccountName / 邮箱'
                    onPressEnter={() => void handleLdapSearch()}
                  />
                  <Button loading={ldapSearching} onClick={() => void handleLdapSearch()}>
                    搜索
                  </Button>
                </Space>
              </Form.Item>
              <Table
                size='small'
                rowKey='dn'
                pagination={false}
                loading={ldapSearching}
                data={ldapResults}
                columns={ldapColumns as never}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedLdapDn ? [selectedLdapDn] : [],
                  onChange: (keys) => setSelectedLdapDn(String(keys[0] ?? '')),
                }}
                scroll={{ y: 200 }}
                className='mb-12px'
              />
              <div className='text-12px text-t-tertiary mb-8px'>
                选中后将自动创建或关联本地账号（绑定 LDAP），再加入团队。
              </div>
            </>
          )}

          <Form.Item label='团队角色' required>
            <Select value={role} onChange={(v) => setRole(v as TeamMemberRole)}>
              {ROLE_OPTIONS.map((o) => (
                <Select.Option key={o.value} value={o.value}>
                  {o.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
};

export default TeamAddMemberModal;
