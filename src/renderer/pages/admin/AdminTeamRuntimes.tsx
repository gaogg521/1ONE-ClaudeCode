/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Button, Card, Input, Message, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AdminPageWrapper from './components/AdminPageWrapper';
import TeamRuntimeFleetPanel from '@/renderer/pages/superAssistant/components/TeamRuntimeFleetPanel';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { syncFleetWithAdminBackend } from '@/renderer/services/teamRuntimeAdminSync';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import useSWR from 'swr';

type ExitPasswordStatus = { isSet: boolean };

const ExitPasswordCard: React.FC = () => {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { data: status, mutate } = useSWR<ExitPasswordStatus>(
    'admin/enterprise/exit-password/status',
    () => fetchWebuiApiJson<ExitPasswordStatus>('/api/admin/enterprise/exit-password/status'),
    { revalidateOnFocus: false }
  );

  const handleSet = async () => {
    if (!newPassword.trim()) {
      Message.warning(t('admin.teamRuntimes.exitPwdRequired', { defaultValue: '退出密码不能为空' }));
      return;
    }
    setSaving(true);
    try {
      await fetchWebuiApiJson('/api/admin/enterprise/exit-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword.trim() }),
      });
      setNewPassword('');
      await mutate();
      Message.success(t('admin.teamRuntimes.exitPwdSaved', { defaultValue: '退出密码已设置' }));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : '设置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await fetchWebuiApiJson('/api/admin/enterprise/exit-password', { method: 'DELETE' });
      await mutate();
      Message.success(t('admin.teamRuntimes.exitPwdCleared', { defaultValue: '退出密码已清除，客户端将无法自助退出' }));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : '清除失败');
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card className='mt-16px'>
      <Typography.Title heading={6} style={{ margin: '0 0 4px' }}>
        {t('admin.teamRuntimes.exitPwdTitle', { defaultValue: '客户端退出密码' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' style={{ fontSize: 12, margin: '0 0 12px' }}>
        {t('admin.teamRuntimes.exitPwdDesc', {
          defaultValue:
            '设置后，客户端机器须凭此密码在设置页面中申请退出企业。留空则禁止客户端自助退出。',
        })}
      </Typography.Paragraph>
      <div className='text-12px text-t-secondary mb-8px'>
        {status?.isSet
          ? t('admin.teamRuntimes.exitPwdStatus_set', { defaultValue: '当前状态：已设置' })
          : t('admin.teamRuntimes.exitPwdStatus_unset', { defaultValue: '当前状态：未设置（客户端无法自助退出）' })}
      </div>
      <div className='flex items-center gap-8px'>
        <Input.Password
          value={newPassword}
          onChange={setNewPassword}
          placeholder={t('admin.teamRuntimes.exitPwdPlaceholder', {
            defaultValue: status?.isSet ? '输入新密码以更新' : '输入退出密码',
          })}
          style={{ maxWidth: 280 }}
          onPressEnter={() => void handleSet()}
        />
        <Button type='primary' loading={saving} onClick={() => void handleSet()}>
          {status?.isSet
            ? t('admin.teamRuntimes.exitPwdUpdate', { defaultValue: '更新密码' })
            : t('admin.teamRuntimes.exitPwdSet', { defaultValue: '设置密码' })}
        </Button>
        {status?.isSet ? (
          <Button status='danger' loading={clearing} onClick={() => void handleClear()}>
            {t('admin.teamRuntimes.exitPwdClear', { defaultValue: '清除密码' })}
          </Button>
        ) : null}
      </div>
    </Card>
  );
};

const AdminTeamRuntimes: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { identity, hasJoinedEnterprise } = useEditionFeatures();
  const tenantId = identity.tenantId;
  const asAdmin = isEnterpriseAdminRole(user?.role);
  const channel = isElectronDesktop() ? 'desktop' : 'browser';

  const { data: nodes, isLoading, error, mutate } = useSWR(
    user?.id ? `admin-team-runtime/${tenantId}/${asAdmin ? 'admin' : 'member'}` : null,
    () =>
      syncFleetWithAdminBackend({
        tenantId,
        userId: user!.id,
        channel,
        includeOffline: true,
        asAdmin,
        authenticated: hasJoinedEnterprise,
      }),
    { refreshInterval: 30_000 }
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <AdminPageWrapper>
      <div className='mb-16px'>
        <Typography.Title heading={5} style={{ margin: 0 }}>
          {t('admin.teamRuntimes.title', { defaultValue: '团队运行时' })}
        </Typography.Title>
        <Typography.Paragraph type='secondary' style={{ margin: '8px 0 0' }}>
          {t('admin.teamRuntimes.desc', {
            defaultValue:
              '汇总 C/S 桌面端与 B/S 浏览器端上报的机器名、IP 与已安装 Agent，数据与超级管理员后台同步。',
          })}
        </Typography.Paragraph>
      </div>
      {error ? (
        <Card>
          <Typography.Text type='error'>
            {t('admin.teamRuntimes.loadError', { defaultValue: '加载运行时节点失败，请检查企业后台服务是否可用。' })}
          </Typography.Text>
        </Card>
      ) : (
        <Card loading={isLoading}>
          <TeamRuntimeFleetPanel
            enabled
            teamIds={undefined}
            nodesOverride={nodes}
            onRefresh={refresh}
            loading={isLoading}
          />
        </Card>
      )}
      {asAdmin ? <ExitPasswordCard /> : null}
    </AdminPageWrapper>
  );
};

export default AdminTeamRuntimes;
