/**
 * Enterprise Settings Page
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Message, Space, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import {
  type EnterpriseProfileRecord,
  getEnterpriseProfile,
  updateEnterpriseProfile,
} from '@/renderer/utils/enterpriseApi/modules';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import { dispatchWebuiConfigRefresh } from '@/renderer/utils/webuiConfigSync';

const EnterpriseSettings: React.FC = () => {
  const { t } = useTranslation();
  const profileState = useEnterpriseAsyncData<EnterpriseProfileRecord | null>(
    getEnterpriseProfile,
    null,
    t('settings.enterpriseConsole.settingsLoadFailed', {
      defaultValue: '加载企业设置失败',
    })
  );
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profileState.data) {
      setName(profileState.data.name ?? '');
    }
  }, [profileState.data]);

  const hasChanges = useMemo(() => {
    if (!profileState.data) {
      return false;
    }
    return name.trim() !== profileState.data.name;
  }, [name, profileState.data]);

  const createdAtLabel = profileState.data
    ? new Date(profileState.data.created_at).toLocaleString()
    : '—';
  const updatedAtLabel = profileState.data
    ? new Date(profileState.data.updated_at).toLocaleString()
    : '—';

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Message.warning(
        t('settings.enterpriseConsole.settingsNameRequired', {
          defaultValue: '请输入企业名称',
        })
      );
      return;
    }
    setSaving(true);
    try {
      await updateEnterpriseProfile({ name: trimmed });
      Message.success(
        t('settings.enterpriseConsole.settingsSaved', {
          defaultValue: '企业设置已保存',
        })
      );
      dispatchWebuiConfigRefresh();
      await profileState.reload();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('settings.enterpriseConsole.settingsSaveFailed', {
            defaultValue: '保存企业设置失败',
          })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageWrapper>
      <div className='max-w-960px mx-auto flex flex-col gap-24px'>
        <ModulePageHeader
          title={t('settings.enterpriseConsole.navSettings', { defaultValue: '企业设置' })}
          description={t('settings.enterpriseConsole.settingsDesc', {
            defaultValue: '维护当前企业的基础信息。首版支持修改企业名称，并查看企业标识与创建时间。',
          })}
          actions={
            <Button onClick={() => void profileState.reload()}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
          }
        />

        <ModuleDataState
          loading={profileState.loading}
          error={profileState.error}
          empty={profileState.data === null}
          emptyDescription={t('settings.enterpriseConsole.settingsEmpty', {
            defaultValue: '当前尚未创建企业。',
          })}
        >
          <Card bordered={false} className='rd-12px'>
            <Form layout='vertical'>
              <Form.Item
                label={t('settings.enterpriseConsole.settingsNameLabel', {
                  defaultValue: '企业名称',
                })}
              >
                <Input
                  value={name}
                  maxLength={80}
                  placeholder={t('settings.enterpriseConsole.settingsNamePlaceholder', {
                    defaultValue: '请输入企业名称',
                  })}
                  onChange={setName}
                />
              </Form.Item>
            </Form>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-12px mt-8px'>
              <Card size='small'>
                <Typography.Text type='secondary'>
                  {t('settings.enterpriseConsole.settingsIdLabel', {
                    defaultValue: '企业 ID',
                  })}
                </Typography.Text>
                <Typography.Paragraph className='mb-0 mt-6px break-all'>
                  {profileState.data?.id ?? '—'}
                </Typography.Paragraph>
              </Card>
              <Card size='small'>
                <Typography.Text type='secondary'>
                  {t('settings.enterpriseConsole.settingsCreatedAtLabel', {
                    defaultValue: '创建时间',
                  })}
                </Typography.Text>
                <Typography.Paragraph className='mb-0 mt-6px'>{createdAtLabel}</Typography.Paragraph>
              </Card>
              <Card size='small'>
                <Typography.Text type='secondary'>
                  {t('settings.enterpriseConsole.settingsUpdatedAtLabel', {
                    defaultValue: '最近更新',
                  })}
                </Typography.Text>
                <Typography.Paragraph className='mb-0 mt-6px'>{updatedAtLabel}</Typography.Paragraph>
              </Card>
            </div>

            <Space className='mt-16px'>
              <Button type='primary' loading={saving} disabled={!hasChanges} onClick={() => void handleSave()}>
                {t('common.save', { defaultValue: '保存' })}
              </Button>
              <Button
                disabled={!profileState.data || saving}
                onClick={() => setName(profileState.data?.name ?? '')}
              >
                {t('settings.enterpriseConsole.settingsReset', { defaultValue: '重置' })}
              </Button>
            </Space>
          </Card>
        </ModuleDataState>
      </div>
    </AdminPageWrapper>
  );
};

export default EnterpriseSettings;
