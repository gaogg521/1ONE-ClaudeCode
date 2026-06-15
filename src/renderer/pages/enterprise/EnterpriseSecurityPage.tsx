/**
 * Enterprise Security & Audit Page
 */
import React from 'react';
import { Card, Table, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { isSystemAdminRole } from '@/common/auth/enterpriseRoles';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import EnterpriseEditionAccessPanel from '@/renderer/pages/enterprise/components/EnterpriseEditionAccessPanel';
import { listAuditLogs, type AuditLogRecord } from '@/renderer/utils/enterpriseApi/modules';

const GOVERNANCE_ACTION_KEYS: Record<string, string> = {
  'governance.claim_system_admin': 'admin.security.actionClaimSystemAdmin',
  'governance.grant_system_admin': 'admin.security.actionGrantSystemAdmin',
  'governance.revoke_system_admin': 'admin.security.actionRevokeSystemAdmin',
};

function formatAuditResource(resource: string): string {
  const parts = resource.split(':');
  if (parts[0] === 'user' && parts.length >= 3) {
    return parts.slice(2).join(':');
  }
  return resource;
}

const EnterpriseSecurityPage: React.FC = () => {
  const { t } = useTranslation();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const isSystemAdmin = isSystemAdminRole(effectiveRole);
  const logsState = useEnterpriseAsyncData(
    listAuditLogs,
    [],
    t('admin.security.loadFailed', { defaultValue: '加载审计日志失败' })
  );

  const resolveActionLabel = (action: string): string => {
    const key = GOVERNANCE_ACTION_KEYS[action];
    if (!key) {
      return action;
    }
    const defaults: Record<string, string> = {
      'admin.security.actionClaimSystemAdmin': '认领系统管理员',
      'admin.security.actionGrantSystemAdmin': '授予系统管理员',
      'admin.security.actionRevokeSystemAdmin': '收回系统管理员',
    };
    return t(key, { defaultValue: defaults[key] ?? action });
  };

  const columns = [
    {
      title: t('admin.security.colTime', { defaultValue: '时间' }),
      dataIndex: 'created_at',
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: t('admin.security.colActor', { defaultValue: '操作者' }),
      dataIndex: 'username',
      render: (v: string) => v || '—',
    },
    {
      title: t('admin.security.colAction', { defaultValue: '操作' }),
      dataIndex: 'action',
      render: (v: string) => (
        <Tag
          color={
            v.startsWith('governance.')
              ? 'orangered'
              : v.includes('login')
                ? 'green'
                : v.includes('delete')
                  ? 'red'
                  : 'arcoblue'
          }
        >
          {resolveActionLabel(v)}
        </Tag>
      ),
    },
    {
      title: t('admin.security.colTarget', { defaultValue: '对象' }),
      dataIndex: 'resource',
      render: (v: string) => formatAuditResource(v),
    },
    {
      title: t('admin.security.colIp', { defaultValue: 'IP' }),
      dataIndex: 'ip_address',
      render: (v: string) => v || '—',
    },
  ];

  return (
    <AdminPageWrapper>
      <div className='max-w-1200px mx-auto'>
        <ModulePageHeader
          title={t('settings.enterpriseConsole.navSecurity', { defaultValue: '安全与审计' })}
          description={
            isSystemAdmin
              ? t('admin.security.descAdmin', {
                  defaultValue: '全组织操作审计日志与安全事件追踪，保障企业团队数据合规。',
                })
              : t('admin.security.descMember', {
                  defaultValue: '查看您与同团队成员的操作审计记录（不含其他团队）。',
                })
          }
        />
        {isSystemAdmin ? <EnterpriseEditionAccessPanel /> : null}
        <Card bordered={false} className='rd-12px'>
          <ModuleDataState
            loading={logsState.loading}
            error={logsState.error}
            empty={logsState.data.length === 0}
            emptyDescription={
              isSystemAdmin
                ? t('admin.security.empty', { defaultValue: '暂无审计日志。操作记录将自动生成。' })
                : t('admin.security.emptyMember', { defaultValue: '暂无团队相关审计记录。' })
            }
          >
            <Table
              data={logsState.data}
              rowKey='id'
              columns={columns}
              pagination={{ pageSize: 20 }}
              size='small'
              border={false}
            />
          </ModuleDataState>
        </Card>
      </div>
    </AdminPageWrapper>
  );
};

export default EnterpriseSecurityPage;
