/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Message, Tabs, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { previewEnterpriseInvite } from '@/renderer/utils/enterpriseJoinApi';
import { isElectronDesktop } from '@/renderer/utils/platform';

type WebuiJoinEnterprisePanelProps = {
  embedded?: boolean;
};

const WebuiJoinEnterprisePanel: React.FC<WebuiJoinEnterprisePanelProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = isElectronDesktop();
  const {
    loading,
    hasJoinedEnterprise,
    canCreateEnterprise,
    joinWithInviteCode,
    createEnterpriseOrganization,
    webuiApiBase,
  } = useWebuiEnterpriseMode();

  const [inviteCode, setInviteCode] = useState('');
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');

  const mapJoinError = useCallback(
    (err: unknown): string => {
      const code = (err as Error & { code?: string })?.code;
      const map: Record<string, string> = {
        INVALID_CODE: t('settings.webui.joinErrorInvalidCode', { defaultValue: '邀请码无效或已失效' }),
        INVITE_EXPIRED: t('settings.webui.joinErrorExpired', { defaultValue: '邀请码已过期' }),
        INVITE_REVOKED: t('settings.webui.joinErrorRevoked', { defaultValue: '邀请码已作废' }),
        INVITE_EXHAUSTED: t('settings.webui.joinErrorExhausted', { defaultValue: '邀请码已达使用上限' }),
        ALREADY_IN_ENTERPRISE: t('settings.webui.joinErrorAlreadyJoined', {
          defaultValue: '当前账号已加入企业',
        }),
      };
      if (code && map[code]) return map[code];
      return err instanceof Error ? err.message : t('settings.webui.joinErrorGeneric', { defaultValue: '操作失败' });
    },
    [t]
  );

  const handlePreview = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;
    if (isDesktop && !webuiApiBase) {
      Message.warning(t('settings.webui.joinNeedWebuiRunning', { defaultValue: '请先启用 WebUI 服务' }));
      return;
    }
    setPreviewLoading(true);
    setPreviewName(null);
    try {
      const data = await previewEnterpriseInvite(code);
      setPreviewName(data.tenantName);
    } catch (e) {
      Message.error(mapJoinError(e));
    } finally {
      setPreviewLoading(false);
    }
  }, [inviteCode, isDesktop, mapJoinError, t, webuiApiBase]);

  const handleJoin = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;
    if (isDesktop && !webuiApiBase) {
      Message.warning(t('settings.webui.joinNeedWebuiRunning', { defaultValue: '请先启用 WebUI 服务' }));
      return;
    }
    setJoinLoading(true);
    try {
      const result = await joinWithInviteCode(code);
      Message.success(
        t('settings.webui.joinSuccess', {
          tenant: result.tenantName ?? result.tenantId,
          defaultValue: '已加入企业「{{tenant}}」',
        })
      );
      setInviteCode('');
      setPreviewName(null);
      void navigate('/sessions');
    } catch (e) {
      Message.error(mapJoinError(e));
    } finally {
      setJoinLoading(false);
    }
  }, [inviteCode, joinWithInviteCode, mapJoinError, navigate, t, webuiApiBase]);

  const handleCreate = useCallback(async () => {
    const name = orgName.trim();
    if (!name) {
      Message.warning(t('settings.webui.createEnterpriseNameRequired', { defaultValue: '请输入企业名称' }));
      return;
    }
    if (isDesktop && !webuiApiBase) {
      Message.warning(t('settings.webui.joinNeedWebuiRunning', { defaultValue: '请先启用 WebUI 服务' }));
      return;
    }
    setCreateLoading(true);
    try {
      await createEnterpriseOrganization(name);
      Message.success(
        t('settings.webui.createEnterpriseSuccess', {
          tenant: name,
          defaultValue: '已创建企业「{{tenant}}」。请在标题栏切换到「1ONE Code 企业版」进入工作区；组织管理请用侧栏「管理后台」。',
        })
      );
      setOrgName('');
      void navigate('/sessions');
    } catch (e) {
      Message.error(mapJoinError(e));
    } finally {
      setCreateLoading(false);
    }
  }, [createEnterpriseOrganization, mapJoinError, navigate, orgName, t, webuiApiBase]);

  if (loading || hasJoinedEnterprise) {
    return null;
  }

  return (
    <div className={embedded ? undefined : 'mb-16px p-16px rd-12px border border-border-2 bg-2'}>
      {!embedded ? (
        <>
          <div className='text-14px font-600 text-t-primary mb-4px'>
            {t('settings.webui.joinEnterpriseTitle', { defaultValue: '加入企业（可选）' })}
          </div>
          <Typography.Paragraph type='secondary' className='text-12px mb-12px'>
            {t('settings.webui.joinEnterpriseDesc', {
              defaultValue:
                '默认使用单机 WebUI。若贵司已开通1ONE Code 企业版，可通过邀请码加入；系统管理员也可在此创建新企业。',
            })}
          </Typography.Paragraph>
        </>
      ) : null}
      {isDesktop && !webuiApiBase ? (
        <Alert
          className='mb-12px'
          type='warning'
          content={t('settings.webui.joinNeedWebuiRunning', { defaultValue: '请先启用 WebUI 服务' })}
        />
      ) : null}
      {!isDesktop ? (
        <Alert
          className='mb-12px'
          type='info'
          content={t('settings.webui.joinBrowserHint', {
            defaultValue: '加入企业需使用当前 WebUI 登录账号。',
          })}
        />
      ) : null}
      <Tabs activeTab={activeTab} onChange={(k) => setActiveTab(k as 'join' | 'create')}>
        <Tabs.TabPane
          key='join'
          title={t('settings.webui.joinTabInvite', { defaultValue: '邀请码加入' })}
        >
          <Form layout='vertical' className='mt-8px'>
            <Form.Item
              label={t('settings.webui.inviteCodeLabel', { defaultValue: '企业邀请码' })}
            >
              <Input
                value={inviteCode}
                placeholder={t('settings.webui.inviteCodePlaceholder', {
                  defaultValue: '例如 ABCD-EF12',
                })}
                onChange={setInviteCode}
              />
            </Form.Item>
            {previewName ? (
              <Alert
                type='success'
                className='mb-8px'
                content={t('settings.webui.invitePreview', {
                  tenant: previewName,
                  defaultValue: '将加入：{{tenant}}',
                })}
              />
            ) : null}
            <div className='flex gap-8px flex-wrap'>
              <Button loading={previewLoading} onClick={() => void handlePreview()}>
                {t('settings.webui.invitePreviewBtn', { defaultValue: '验证邀请码' })}
              </Button>
              <Button type='primary' loading={joinLoading} onClick={() => void handleJoin()}>
                {t('settings.webui.joinConfirmBtn', { defaultValue: '加入企业' })}
              </Button>
            </div>
          </Form>
        </Tabs.TabPane>
        {canCreateEnterprise ? (
          <Tabs.TabPane
            key='create'
            title={t('settings.webui.joinTabCreate', { defaultValue: '创建企业' })}
          >
            <Form layout='vertical' className='mt-8px'>
              <Form.Item
                label={t('settings.webui.createEnterpriseNameLabel', { defaultValue: '企业名称' })}
              >
                <Input
                  value={orgName}
                  placeholder={t('settings.webui.createEnterpriseNamePlaceholder', {
                    defaultValue: '例如：Acme 科技',
                  })}
                  onChange={setOrgName}
                />
              </Form.Item>
              <Button type='primary' loading={createLoading} onClick={() => void handleCreate()}>
                {t('settings.webui.createEnterpriseBtn', { defaultValue: '创建并加入' })}
              </Button>
            </Form>
          </Tabs.TabPane>
        ) : null}
      </Tabs>
    </div>
  );
};

export default WebuiJoinEnterprisePanel;
