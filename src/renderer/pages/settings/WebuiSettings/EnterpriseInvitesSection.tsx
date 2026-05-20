/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, InputNumber, Message, Table, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import {
  createEnterpriseInvite,
  listEnterpriseInvites,
  revokeEnterpriseInvite,
  type EnterpriseInviteListItem,
} from '@/renderer/utils/enterpriseJoinApi';

const EnterpriseInvitesSection: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EnterpriseInviteListItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState<number | undefined>(undefined);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEnterpriseInvites();
      setRows(data);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data = await createEnterpriseInvite({
        maxUses: maxUses && maxUses > 0 ? maxUses : undefined,
        expiresInDays: expiresInDays && expiresInDays > 0 ? expiresInDays : undefined,
      });
      Message.success(
        t('settings.webui.inviteCreated', {
          code: data.displayCode,
          defaultValue: '已生成邀请码：{{code}}',
        })
      );
      await load();
    } catch (e) {
      Message.error(e instanceof Error ? e.message : 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeEnterpriseInvite(id);
      Message.success(t('settings.webui.inviteRevoked', { defaultValue: '邀请码已作废' }));
      await load();
    } catch (e) {
      Message.error(e instanceof Error ? e.message : 'Failed to revoke');
    }
  };

  const columns = [
    {
      title: t('settings.webui.inviteTableCode', { defaultValue: '邀请码' }),
      dataIndex: 'display_code',
    },
    {
      title: t('settings.webui.inviteTableUses', { defaultValue: '使用次数' }),
      render: (_: unknown, record: EnterpriseInviteListItem) => {
        const max = record.max_uses ?? '∞';
        return `${record.use_count} / ${max}`;
      },
    },
    {
      title: t('settings.webui.inviteTableExpires', { defaultValue: '过期时间' }),
      render: (_: unknown, record: EnterpriseInviteListItem) =>
        record.expires_at
          ? new Date(record.expires_at).toLocaleString()
          : t('settings.webui.inviteNeverExpires', { defaultValue: '永不过期' }),
    },
    {
      title: t('settings.webui.inviteTableStatus', { defaultValue: '状态' }),
      render: (_: unknown, record: EnterpriseInviteListItem) =>
        record.revoked
          ? t('settings.webui.inviteRevokedStatus', { defaultValue: '已作废' })
          : t('settings.webui.inviteActiveStatus', { defaultValue: '有效' }),
    },
    {
      title: t('settings.webui.inviteTableActions', { defaultValue: '操作' }),
      render: (_: unknown, record: EnterpriseInviteListItem) =>
        record.revoked ? null : (
          <Button size='mini' status='danger' onClick={() => void handleRevoke(record.id)}>
            {t('settings.webui.inviteRevokeBtn', { defaultValue: '作废' })}
          </Button>
        ),
    },
  ];

  return (
    <div>
      <Typography.Title heading={6} style={{ marginTop: 0 }}>
        {t('settings.webui.invitesSectionTitle', { defaultValue: '企业邀请码' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary'>
        {t('settings.webui.invitesSectionDesc', {
          defaultValue: '生成邀请码供成员在「远程连接 → WebUI」中加入本企业。',
        })}
      </Typography.Paragraph>
      <Form layout='inline' className='mb-16px flex-wrap gap-8px'>
        <Form.Item label={t('settings.webui.inviteMaxUses', { defaultValue: '可用次数' })}>
          <InputNumber min={1} value={maxUses} placeholder='∞' onChange={(v) => setMaxUses(v)} />
        </Form.Item>
        <Form.Item label={t('settings.webui.inviteExpiresDays', { defaultValue: '有效天数' })}>
          <InputNumber min={1} value={expiresInDays} onChange={(v) => setExpiresInDays(v)} />
        </Form.Item>
        <Form.Item>
          <Button type='primary' loading={creating} onClick={() => void handleCreate()}>
            {t('settings.webui.inviteGenerateBtn', { defaultValue: '生成邀请码' })}
          </Button>
        </Form.Item>
      </Form>
      <Table
        loading={loading}
        columns={columns}
        data={rows}
        rowKey='id'
        pagination={false}
        size='small'
        border={false}
      />
    </div>
  );
};

export default EnterpriseInvitesSection;
