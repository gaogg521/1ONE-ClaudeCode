/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Message, Modal, Radio, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseServerHeartbeat } from '@/renderer/hooks/enterprise/useEnterpriseServerHeartbeat';
import { webui } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import {
  DEFAULT_WEBUI_DEPLOYMENT_ROLE,
  normalizeEnterpriseServerUrl,
  normalizeWebuiDeploymentRole,
  WEBUI_DEPLOYMENT_ROLE_KEY,
  WEBUI_ENTERPRISE_SERVER_URL_KEY,
  type WebuiDeploymentRole,
} from '@/common/config/webuiEnterpriseConfig';
import { ENTERPRISE_API_ORIGINS_KEY } from '@/common/config/enterpriseApiOrigins';
import { fetchRemoteEnterpriseJson } from '@/renderer/utils/enterpriseJoinApi';
import { getClientEnterpriseServerOrigin } from '@/renderer/utils/webuiApiBase';

function hasExplicitPort(raw: string): boolean {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(withScheme).port !== '';
  } catch {
    return false;
  }
}

/**
 * Ports Chrome refuses to fetch (ERR_UNSAFE_PORT) — mostly well-known service
 * ports that browsers block to prevent cross-protocol attacks. Rejecting these
 * at save time avoids confusing heartbeat failures where fetch silently aborts.
 */
const UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
]);

function validateServerPort(raw: string): { valid: boolean; reason?: string } {
  if (!hasExplicitPort(raw)) {
    return { valid: false, reason: 'no_port' };
  }
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const port = Number.parseInt(new URL(withScheme).port, 10);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      return { valid: false, reason: 'port_out_of_range' };
    }
    if (UNSAFE_PORTS.has(port)) {
      return { valid: false, reason: 'port_unsafe' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
}

async function readDeploymentConfig(): Promise<{ role: WebuiDeploymentRole; url: string }> {
  if (isElectronDesktop()) {
    const role = await ConfigStorage.get(WEBUI_DEPLOYMENT_ROLE_KEY).catch((): undefined => undefined);
    const url = await ConfigStorage.get(WEBUI_ENTERPRISE_SERVER_URL_KEY).catch((): undefined => undefined);
    return { role: normalizeWebuiDeploymentRole(role), url: typeof url === 'string' ? url : '' };
  }
  const role = typeof window !== 'undefined' ? window.localStorage.getItem(WEBUI_DEPLOYMENT_ROLE_KEY) : null;
  const url = typeof window !== 'undefined' ? window.localStorage.getItem(WEBUI_ENTERPRISE_SERVER_URL_KEY) : null;
  return { role: normalizeWebuiDeploymentRole(role), url: url ?? '' };
}

async function writeDeploymentConfig(role: WebuiDeploymentRole, url: string): Promise<void> {
  if (isElectronDesktop()) {
    await ConfigStorage.set(WEBUI_DEPLOYMENT_ROLE_KEY, role);
    await ConfigStorage.set(WEBUI_ENTERPRISE_SERVER_URL_KEY, url);
    // Clear stale enterpriseApiOrigins whenever deployment config changes.
    // Otherwise entries remembered from a previous server-mode session (e.g.
    // http://127.0.0.1:25809) pollute fetchWebuiApi candidates and the client
    // keeps probing an unreachable local address instead of the remote server.
    await ConfigStorage.set(ENTERPRISE_API_ORIGINS_KEY, []).catch((): undefined => undefined);
    return;
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WEBUI_DEPLOYMENT_ROLE_KEY, role);
    window.localStorage.setItem(WEBUI_ENTERPRISE_SERVER_URL_KEY, url);
    window.localStorage.removeItem(ENTERPRISE_API_ORIGINS_KEY);
  }
}

async function clearDeploymentConfig(): Promise<void> {
  await writeDeploymentConfig('server', '');
}

/**
 * Enterprise deployment role switch. Keeps one server per LAN: everyone defaults to
 * 'server' (single-machine, unchanged), and a user can flip this machine to 'client'
 * and point it at a remote enterprise server's address.
 */
const EnterpriseDeploymentModeCard: React.FC = () => {
  const { t } = useTranslation();
  const [role, setRole] = useState<WebuiDeploymentRole>(DEFAULT_WEBUI_DEPLOYMENT_ROLE);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const { hasInstanceEnterprise, refreshEnterpriseContext } = useWebuiEnterpriseMode();

  // Feature 2: remote enterprise name (client mode)
  const [remoteTenantName, setRemoteTenantName] = useState<string | null>(null);
  // Feature 4: exit modal state
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitCode, setExitCode] = useState('');
  const [exiting, setExiting] = useState(false);

  const { status: heartbeat, events: connectionEvents } = useEnterpriseServerHeartbeat(
    role === 'client' ? normalizeEnterpriseServerUrl(url) : null
  );

  // Disconnect alert: show when server transitions online → offline
  const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
  const [showConnectionLog, setShowConnectionLog] = useState(false);
  const prevHeartbeatRef = useRef<typeof heartbeat>('idle');
  useEffect(() => {
    if (prevHeartbeatRef.current === 'online' && heartbeat === 'offline') {
      setShowDisconnectAlert(true);
    }
    prevHeartbeatRef.current = heartbeat;
  }, [heartbeat]);

  useEffect(() => {
    void readDeploymentConfig().then((c) => {
      setRole(c.role);
      setUrl(c.url);
    });
  }, []);

  // Feature 2: sync remote enterprise name with heartbeat status
  useEffect(() => {
    if (role !== 'client' || heartbeat !== 'online') {
      setRemoteTenantName(null);
      return;
    }
    const origin = normalizeEnterpriseServerUrl(url);
    if (!origin) return;
    void fetchRemoteEnterpriseJson<{ tenantName: string | null }>(
      `${origin}/api/auth/enterprise-info`
    )
      .then((data) => setRemoteTenantName(data.tenantName ?? null))
      .catch(() => setRemoteTenantName(null));
  }, [heartbeat, role, url]);

  const doSave = async () => {
    setSaving(true);
    try {
      if (role === 'client' && isElectronDesktop() && hasInstanceEnterprise) {
        const res = await webui.demoteToClient.invoke();
        if (!res?.success) {
          throw new Error(res?.msg || 'demote failed');
        }
        await refreshEnterpriseContext();
      }
      await writeDeploymentConfig(role, url.trim());
      Message.success(t('settings.webui.deploySaved', { defaultValue: '已保存部署模式' }));
    } catch {
      Message.error(t('settings.webui.deploySaveFailed', { defaultValue: '保存失败' }));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (role === 'client' && !normalizeEnterpriseServerUrl(url)) {
      Message.warning(
        t('settings.webui.deployServerUrlInvalid', {
          defaultValue: '请输入有效的服务器地址，例如 192.168.1.10:25809',
        })
      );
      return;
    }
    if (role === 'client') {
      const portCheck = validateServerPort(url);
      if (!portCheck.valid) {
        const reasonMap: Record<string, string> = {
          no_port: t('settings.webui.deployServerUrlNoPort', {
            defaultValue: '未检测到端口号，服务器地址通常需要指定端口，如 192.168.1.10:25808',
          }),
          port_out_of_range: t('settings.webui.deployServerPortOutOfRange', {
            defaultValue: '端口必须在 1024–65535 之间',
          }),
          port_unsafe: t('settings.webui.deployServerPortUnsafe', {
            defaultValue: '该端口被浏览器视为不安全（如 25/110/143 等），请换一个端口',
          }),
          invalid_url: t('settings.webui.deployServerUrlInvalid', {
            defaultValue: '请输入有效的服务器地址，例如 192.168.1.10:25809',
          }),
        };
        Message.warning(reasonMap[portCheck.reason ?? 'invalid_url']);
        return;
      }
    }
    if (role === 'client' && hasInstanceEnterprise) {
      Modal.confirm({
        title: t('settings.webui.demoteConfirmTitle', { defaultValue: '切换为客户端？' }),
        content: t('settings.webui.demoteConfirmDesc', {
          defaultValue: '将归档本机企业数据（移到归档目录，可后续恢复）并降级为普通成员，需重新登录。',
        }),
        okText: t('common.confirm', { defaultValue: '确认' }),
        cancelText: t('common.cancel', { defaultValue: '取消' }),
        onOk: () => void doSave(),
      });
      return;
    }
    void doSave();
  };

  // Feature 4: exit enterprise
  const handleExitEnterprise = async () => {
    if (!exitCode.trim()) {
      Message.warning(t('settings.webui.exitCodeRequired', { defaultValue: '请输入退出密码' }));
      return;
    }
    setExiting(true);
    try {
      const remoteOrigin = await getClientEnterpriseServerOrigin();
      if (!remoteOrigin) {
        Message.error(t('settings.webui.exitNoServer', { defaultValue: '未配置企业服务器地址' }));
        return;
      }
      await fetchRemoteEnterpriseJson(`${remoteOrigin}/api/auth/enterprise-leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitCode: exitCode.trim() }),
        credentials: 'include',
      });
      await clearDeploymentConfig();
      setShowExitModal(false);
      Message.success(t('settings.webui.exitSuccess', { defaultValue: '已退出企业，配置已清除' }));
      await refreshEnterpriseContext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '退出失败';
      Message.error(msg);
    } finally {
      setExiting(false);
    }
  };

  return (
    <div className='mb-16px p-16px rd-12px border border-border-2 bg-2'>
      <div className='text-14px font-600 text-t-primary mb-4px'>
        {t('settings.webui.deployModeTitle', { defaultValue: '企业部署模式' })}
      </div>
      <Typography.Paragraph type='secondary' className='text-12px mb-12px'>
        {t('settings.webui.deployModeDesc', {
          defaultValue:
            '同一局域网内应只有一台作为服务器，其余均为客户端连接到它。默认本机为客户端；创建企业后本机自动成为服务器，托管企业数据。',
        })}
      </Typography.Paragraph>
      <Radio.Group
        type='button'
        value={role}
        onChange={(v) => setRole(v as WebuiDeploymentRole)}
        className='mb-12px'
      >
        <Radio value='server'>
          {t('settings.webui.deployRoleServer', { defaultValue: '本机作为服务器' })}
        </Radio>
        <Radio value='client'>
          {t('settings.webui.deployRoleClient', { defaultValue: '本机作为客户端' })}
        </Radio>
      </Radio.Group>
      {role === 'client' ? (
        <div className='mb-12px'>
          <div className='text-12px text-t-secondary mb-4px'>
            {t('settings.webui.deployServerUrlLabel', { defaultValue: '企业服务器地址' })}
          </div>
          <Input
            value={url}
            onChange={setUrl}
            placeholder={t('settings.webui.deployServerUrlPlaceholder', {
              defaultValue: '例如 192.168.1.10:25808',
            })}
          />
          <div className='text-11px text-t-tertiary mt-4px'>
            {t('settings.webui.deployServerUrlHint', {
              defaultValue: '请填写含端口的完整地址（服务端端口可在服务器 WebUI 设置中查看）',
            })}
          </div>
          {normalizeEnterpriseServerUrl(url) && !hasExplicitPort(url) ? (
            <div className='mt-4px text-11px' style={{ color: 'var(--color-warning-6, #ff7d00)' }}>
              {t('settings.webui.deployServerUrlNoPort', {
                defaultValue: '未检测到端口号，服务器地址通常需要指定端口，如 192.168.1.10:25808',
              })}
            </div>
          ) : null}
          {normalizeEnterpriseServerUrl(url) ? (
            <div className='mt-6px flex items-center gap-8px flex-wrap'>
              <Tag
                size='small'
                color={heartbeat === 'online' ? 'green' : heartbeat === 'offline' ? 'red' : 'gray'}
              >
                {heartbeat === 'online'
                  ? t('settings.webui.deployServerOnline', { defaultValue: '服务器在线' })
                  : heartbeat === 'offline'
                    ? t('settings.webui.deployServerOffline', { defaultValue: '服务器离线（检查地址或服务器是否启动）' })
                    : t('settings.webui.deployServerChecking', { defaultValue: '检测中…' })}
              </Tag>
              {/* Feature 2: show enterprise name when online */}
              {heartbeat === 'online' && remoteTenantName ? (
                <span className='text-11px text-t-secondary'>
                  {t('settings.webui.deployClientEnterprise', {
                    defaultValue: '已连接企业：{{name}}',
                    name: remoteTenantName,
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
          {/* Feature 4: exit enterprise button (only when server is online) */}
          {heartbeat === 'online' ? (
            <div className='mt-8px'>
              <Button
                size='small'
                status='danger'
                onClick={() => {
                  setExitCode('');
                  setShowExitModal(true);
                }}
              >
                {t('settings.webui.exitEnterpriseBtn', { defaultValue: '退出企业' })}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Alert
          type='info'
          className='mb-12px'
          content={t('settings.webui.deployServerHint', {
            defaultValue: '本机作为企业服务器，局域网内其他客户端可连接到本机地址。',
          })}
        />
      )}
      {/* Disconnect alert */}
      {showDisconnectAlert ? (
        <Alert
          type='error'
          className='mb-12px'
          content={
            <div className='flex items-center justify-between gap-8px'>
              <span>
                {t('settings.webui.deployServerDisconnected', {
                  defaultValue: '服务端已断开连接，请检查服务器是否在线。',
                })}
              </span>
              <div className='flex gap-8px flex-shrink-0'>
                <Button
                  size='mini'
                  type='outline'
                  onClick={() => {
                    setShowConnectionLog(true);
                    setShowDisconnectAlert(false);
                  }}
                >
                  {t('settings.webui.viewConnectionLog', { defaultValue: '查看连接日志' })}
                </Button>
                <Button size='mini' onClick={() => setShowDisconnectAlert(false)}>
                  {t('common.confirm', { defaultValue: '确认' })}
                </Button>
              </div>
            </div>
          }
        />
      ) : null}

      <Button type='primary' loading={saving} onClick={() => void handleSave()}>
        {t('settings.webui.deploySave', { defaultValue: '保存' })}
      </Button>

      {/* Connection log button (visible when in client mode) */}
      {role === 'client' && connectionEvents.length > 0 ? (
        <Button
          size='small'
          type='text'
          className='ml-8px'
          onClick={() => setShowConnectionLog(true)}
        >
          {t('settings.webui.viewConnectionLog', { defaultValue: '查看连接日志' })}
        </Button>
      ) : null}

      {/* Connection log modal */}
      <Modal
        title={t('settings.webui.connectionLogTitle', { defaultValue: '服务器连接日志' })}
        visible={showConnectionLog}
        onCancel={() => setShowConnectionLog(false)}
        footer={
          <Button onClick={() => setShowConnectionLog(false)}>
            {t('common.close', { defaultValue: '关闭' })}
          </Button>
        }
      >
        {connectionEvents.length === 0 ? (
          <Typography.Paragraph type='secondary'>
            {t('settings.webui.connectionLogEmpty', { defaultValue: '暂无连接记录' })}
          </Typography.Paragraph>
        ) : (
          <div>
            {connectionEvents.map((ev, i) => (
              <div key={i} className='flex items-center gap-8px py-4px border-b border-border-2'>
                <Tag
                  size='small'
                  color={ev.type === 'connected' ? 'green' : 'red'}
                >
                  {ev.type === 'connected'
                    ? t('settings.webui.connectionLogConnected', { defaultValue: '已连接' })
                    : t('settings.webui.connectionLogDisconnected', { defaultValue: '已断开' })}
                </Tag>
                <span className='text-12px text-t-secondary'>
                  {new Date(ev.time).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Feature 4: exit modal */}
      <Modal
        title={t('settings.webui.exitModalTitle', { defaultValue: '退出企业' })}
        visible={showExitModal}
        onCancel={() => setShowExitModal(false)}
        footer={[
          <Button key='cancel' onClick={() => setShowExitModal(false)}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>,
          <Button key='confirm' type='primary' status='danger' loading={exiting} onClick={() => void handleExitEnterprise()}>
            {t('settings.webui.exitConfirmBtn', { defaultValue: '确认退出' })}
          </Button>,
        ]}
      >
        <div className='mb-8px text-13px text-t-secondary'>
          {t('settings.webui.exitModalDesc', {
            defaultValue: '退出后将清除本机的企业配置，需要联系管理员重新发放邀请码才能再次加入。',
          })}
        </div>
        <div className='text-12px text-t-secondary mb-4px'>
          {t('settings.webui.exitCodeLabel', { defaultValue: '退出密码（由企业管理员在控制台设置）' })}
        </div>
        <Input.Password
          value={exitCode}
          onChange={setExitCode}
          placeholder={t('settings.webui.exitCodePlaceholder', { defaultValue: '请输入退出密码' })}
          onPressEnter={() => void handleExitEnterprise()}
        />
      </Modal>
    </div>
  );
};

export default EnterpriseDeploymentModeCard;
