/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, Message, Modal, Radio, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
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
    return;
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WEBUI_DEPLOYMENT_ROLE_KEY, role);
    window.localStorage.setItem(WEBUI_ENTERPRISE_SERVER_URL_KEY, url);
  }
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

  useEffect(() => {
    void readDeploymentConfig().then((c) => {
      setRole(c.role);
      setUrl(c.url);
    });
  }, []);

  const doSave = async () => {
    setSaving(true);
    try {
      // Demoting a server back to client dissolves the locally hosted enterprise + downgrades role.
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
              defaultValue: '例如 192.168.1.10:25809',
            })}
          />
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
      <Button type='primary' loading={saving} onClick={() => void handleSave()}>
        {t('settings.webui.deploySave', { defaultValue: '保存' })}
      </Button>
    </div>
  );
};

export default EnterpriseDeploymentModeCard;
