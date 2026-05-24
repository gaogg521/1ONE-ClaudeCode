/**
 * Enterprise Security & Audit Page
 */
import React, { useEffect, useState } from 'react';
import { Card, Spin, Table, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';

type AuditLog = { id: string; username: string; action: string; resource: string; ip_address: string; created_at: number };

const EnterpriseSecurityPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const res = await fetchWebuiApiJson<{ success: boolean; data: AuditLog[] }>('/api/admin/audit-logs');
      if (res?.success) setLogs(res.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  })(); }, []);

  const columns = [
    { title: '时间', dataIndex: 'created_at', render: (v: number) => new Date(v).toLocaleString() },
    { title: '用户', dataIndex: 'username' },
    { title: '操作', dataIndex: 'action', render: (v: string) => <Tag color={v.includes('login') ? 'green' : v.includes('delete') ? 'red' : 'arcoblue'}>{v}</Tag> },
    { title: '资源', dataIndex: 'resource' },
    { title: 'IP', dataIndex: 'ip_address', render: (v: string) => v || '—' },
  ];

  return (
    <div className='max-w-1200px mx-auto'>
      <Typography.Title heading={5} className='mt-0 mb-4px'>{t('settings.enterpriseConsole.navSecurity', { defaultValue: '安全与审计' })}</Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-20px text-13px'>{t('admin.security.desc', { defaultValue: '操作审计日志与安全事件追踪，保障企业数据合规。' })}</Typography.Paragraph>
      <Card bordered={false} className='rd-12px'>
        {loading ? <div className='flex justify-center py-40px'><Spin /></div> :
          logs.length === 0 ? <Typography.Text type='secondary'>{t('admin.security.empty', { defaultValue: '暂无审计日志。操作记录将自动生成。' })}</Typography.Text> :
          <Table data={logs} rowKey='id' columns={columns} pagination={{ pageSize: 20 }} size='small' border={false} />
        }
      </Card>
    </div>
  );
};

export default EnterpriseSecurityPage;
