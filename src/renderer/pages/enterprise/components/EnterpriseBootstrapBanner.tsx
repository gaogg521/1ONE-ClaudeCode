/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Alert, Button, Input, Message, Modal } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';

type EnterpriseBootstrapBannerProps = {
  className?: string;
};

/**
 * Bootstrap guidance for an instance with no system_admin / no enterprise yet.
 * Surfaces the "claim system admin" and "create enterprise" actions inline (desktop
 * uses IPC, browser WebUI uses HTTP — both handled inside useWebuiEnterpriseMode),
 * so an org_admin is never stranded in an empty console with greyed-out controls.
 */
const EnterpriseBootstrapBanner: React.FC<EnterpriseBootstrapBannerProps> = ({ className }) => {
  const { t } = useTranslation();
  const {
    loading,
    hasJoinedEnterprise,
    canClaimSystemAdmin,
    canCreateEnterprise,
    claimSystemAdmin,
    createEnterpriseOrganization,
  } = useWebuiEnterpriseMode();
  const [claiming, setClaiming] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  if (loading || hasJoinedEnterprise) {
    return null;
  }
  if (!canClaimSystemAdmin && !canCreateEnterprise) {
    return null;
  }

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claimSystemAdmin();
      Message.success(t('settings.webui.postClaimTitle', { defaultValue: '已认领系统管理员' }));
    } catch (e) {
      Message.error(e instanceof Error ? e.message : t('settings.webui.joinErrorGeneric', { defaultValue: '操作失败' }));
    } finally {
      setClaiming(false);
    }
  };

  const handleCreate = async () => {
    const name = orgName.trim();
    if (!name) {
      Message.warning(t('settings.webui.createEnterpriseNameRequired', { defaultValue: '请输入企业名称' }));
      return;
    }
    setCreating(true);
    try {
      await createEnterpriseOrganization(name);
      Message.success(
        t('settings.webui.createEnterpriseSuccess', { tenant: name, defaultValue: '已创建企业「{{tenant}}」' })
      );
      setCreateOpen(false);
      setOrgName('');
    } catch (e) {
      Message.error(e instanceof Error ? e.message : t('settings.webui.joinErrorGeneric', { defaultValue: '操作失败' }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Alert
        className={className}
        type='info'
        title={
          canClaimSystemAdmin
            ? t('settings.webui.claimSystemAdminTitle', { defaultValue: '认领系统管理员' })
            : t('settings.enterpriseConsole.bootstrapCreateTitle', { defaultValue: '创建企业组织' })
        }
        content={
          canClaimSystemAdmin
            ? t('settings.webui.claimSystemAdminDesc', {
                defaultValue:
                  '本实例尚无系统管理员。认领后您可配置认证与邮件、邀请码，并可为他人开启/关闭系统管理员。此操作每个实例仅能在「尚无系统管理员」时执行一次。',
              })
            : t('settings.enterpriseConsole.bootstrapCreateDesc', {
                defaultValue: '认领系统管理员后，创建企业即可邀请成员、配置组织治理。',
              })
        }
        action={
          canClaimSystemAdmin ? (
            <Button type='primary' size='small' loading={claiming} onClick={() => void handleClaim()}>
              {t('settings.webui.claimSystemAdmin', { defaultValue: '认领系统管理员' })}
            </Button>
          ) : (
            <Button type='primary' size='small' onClick={() => setCreateOpen(true)}>
              {t('settings.webui.joinTabCreate', { defaultValue: '创建企业' })}
            </Button>
          )
        }
      />
      <Modal
        title={t('settings.webui.joinTabCreate', { defaultValue: '创建企业' })}
        visible={createOpen}
        confirmLoading={creating}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        okText={t('settings.webui.createEnterpriseBtn', { defaultValue: '创建并加入' })}
        unmountOnExit
      >
        <Input
          value={orgName}
          onChange={setOrgName}
          placeholder={t('settings.webui.createEnterpriseNamePlaceholder', { defaultValue: '例如：Acme 科技' })}
        />
      </Modal>
    </>
  );
};

export default EnterpriseBootstrapBanner;
