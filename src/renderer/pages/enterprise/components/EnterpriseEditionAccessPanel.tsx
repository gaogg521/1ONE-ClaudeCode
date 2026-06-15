/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Message, Switch, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { isSystemAdminRole } from '@/common/auth/enterpriseRoles';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { fetchOrgEditionAccess, saveOrgEditionAccess } from '@/renderer/utils/enterpriseApi/orgEditionAccess';

const EnterpriseEditionAccessPanel: React.FC = () => {
  const { t } = useTranslation();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const canManage = isSystemAdminRole(effectiveRole);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrgEditionAccess();
      setEnabled(data.editionSwitcherEnabled);
    } catch {
      Message.error(
        t('settings.enterpriseConsole.editionAccessLoadFailed', {
          defaultValue: '加载企业团队版模式设置失败',
        })
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleToggle = async (next: boolean) => {
    if (!canManage) {
      Message.warning(
        t('settings.enterpriseConsole.editionAccessSystemAdminOnly', {
          defaultValue: '仅系统管理员可修改此设置',
        })
      );
      return;
    }
    setSaving(true);
    try {
      await saveOrgEditionAccess({ editionSwitcherEnabled: next });
      setEnabled(next);
      Message.success(
        t('settings.enterpriseConsole.editionAccessSaved', {
          defaultValue: '企业团队版模式可见性已更新',
        })
      );
    } catch (err) {
      Message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card bordered={false} className='rd-12px mb-16px'>
      <Typography.Title heading={6} className='mt-0 mb-8px'>
        {t('settings.enterpriseConsole.editionAccessTitle', {
          defaultValue: '企业团队版模式（终端可见性）',
        })}
      </Typography.Title>
      <Typography.Paragraph className='text-13px text-t-secondary mb-12px'>
        {t('settings.enterpriseConsole.editionAccessDesc', {
          defaultValue:
            '默认关闭：普通成员在桌面/浏览器标题栏看到「企业团队版」为禁用状态。开启后，成员可切换到企业团队版工作区；系统管理员始终可用。',
        })}
      </Typography.Paragraph>
      <Alert
        type='warning'
        className='mb-12px'
        content={t('settings.enterpriseConsole.editionAccessHint', {
          defaultValue: '请企业团队版成员慎重操作：此开关影响全员终端上的版本切换入口，与 SSO 登录渠道配置相互独立。',
        })}
      />
      <div className='flex items-center justify-between gap-12px'>
        <span className='text-14px text-t-primary'>
          {t('settings.enterpriseConsole.editionAccessEnableLabel', {
            defaultValue: '允许成员使用企业团队版模式',
          })}
        </span>
        <Switch
          checked={enabled}
          loading={loading || saving}
          disabled={!canManage}
          onChange={(v) => void handleToggle(v)}
        />
      </div>
    </Card>
  );
};

export default EnterpriseEditionAccessPanel;
