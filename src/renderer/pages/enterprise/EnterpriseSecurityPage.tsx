/**
 * Enterprise Security & Audit Page
 */
import React from 'react';
import { Card, Table, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import { listAuditLogs, type AuditLogRecord } from '@/renderer/utils/enterpriseApi/modules';

type AuditLog = AuditLogRecord;

const EnterpriseSecurityPage: React.FC = () => {
  const { t } = useTranslation();
  const { effectiveRole } = useWebuiEnterpriseMode();
  const isAdmin = isEnterpriseAdminRole(effectiveRole);
  const logsState = useEnterpriseAsyncData(
    listAuditLogs,
    [],
    t('admin.security.loadFailed', { defaultValue: '加载审计日志失败' })
  );

  const columns = [
    { title: '时间', dataIndex: 'created_at', render: (v: number) => new Date(v).toLocaleString() },
    { title: '用户', dataIndex: 'username' },
    { title: '操作', dataIndex: 'action', render: (v: string) => <Tag color={v.includes('login') ? 'green' : v.includes('delete') ? 'red' : 'arcoblue'}>{v}</Tag> },
    { title: '资源', dataIndex: 'resource' },
    { title: 'IP', dataIndex: 'ip_address', render: (v: string) => v || '—' },
  ];

  return (
    <AdminPageWrapper>
      <div className='max-w-1200px mx-auto'>
        <ModulePageHeader
          title={t('settings.enterpriseConsole.navSecurity', { defaultValue: '安全与审计' })}
          description={
            isAdmin
              ? t('admin.security.descAdmin', {
                  defaultValue: '全组织操作审计日志与安全事件追踪，保障企业团队数据合规。',
                })
              : t('admin.security.descMember', {
                  defaultValue: '查看您与同团队成员的操作审计记录（不含其他团队）。',
                })
          }
        />
        <Card bordered={false} className='rd-12px'>
          <ModuleDataState
            loading={logsState.loading}
            error={logsState.error}
            empty={logsState.data.length === 0}
            emptyDescription={
              isAdmin
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
