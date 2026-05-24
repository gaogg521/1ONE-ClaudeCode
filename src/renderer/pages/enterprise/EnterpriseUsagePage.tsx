/**
 * Enterprise Usage Statistics Page
 */
import React, { useEffect, useState } from 'react';
import { Card, Grid, Spin, Statistic, Table, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
const { Row, Col } = Grid;

const EnterpriseUsagePage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, pipelines: 0, ragDocs: 0, mcpTools: 0, skills: 0, conversations: 0 });

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const [usersRes, pipelinesRes, ragRes, mcpRes, skillsRes] = await Promise.all([
        fetchWebuiApiJson<{success:boolean;data:any[]}>('/api/admin/users').catch((): null => null),
        fetchWebuiApiJson<{success:boolean;data:any[]}>('/api/admin/pipelines').catch((): null => null),
        fetchWebuiApiJson<{success:boolean;data:any[]}>('/api/admin/rag/documents').catch((): null => null),
        fetchWebuiApiJson<{success:boolean;data:any[]}>('/api/admin/mcp/registry').catch((): null => null),
        fetchWebuiApiJson<{success:boolean;data:any[]}>('/api/admin/skills').catch((): null => null),
      ]);
      setStats({
        users: usersRes?.success ? (usersRes.data||[]).length : 0,
        pipelines: pipelinesRes?.success ? (pipelinesRes.data||[]).length : 0,
        ragDocs: ragRes?.success ? (ragRes.data||[]).reduce((s:number,d:any)=>s+(d.chunk_count||0),0) : 0,
        mcpTools: mcpRes?.success ? (mcpRes.data||[]).filter((m:any)=>m.enabled).length : 0,
        skills: skillsRes?.success ? (skillsRes.data||[]).length : 0,
        conversations: 0,
      });
    } catch { /* ignore */ } finally { setLoading(false); }
  })(); }, []);

  const cards = [
    { title: '企业成员', value: stats.users, color: 'rgb(var(--primary-6))' },
    { title: '会话数量', value: stats.conversations, color: '#00b42a' },
    { title: 'RAG 知识切片', value: stats.ragDocs, color: '#ff7d00' },
    { title: 'MCP 工具', value: stats.mcpTools, color: '#f59e0b' },
    { title: 'Skills 技能', value: stats.skills, color: 'rgb(var(--success-6))' },
    { title: '流水线数量', value: stats.pipelines, color: '#6366f1' },
  ];

  if (loading) return <div className='flex justify-center py-80px'><Spin size={30} /></div>;

  return (
    <div className='max-w-1200px mx-auto'>
      <Typography.Title heading={5} className='mt-0 mb-4px'>{t('settings.enterpriseConsole.navUsage', { defaultValue: '使用统计' })}</Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-20px text-13px'>{t('admin.usage.desc', { defaultValue: '企业资源使用全景，实时统计各模块活跃数据。' })}</Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col key={c.title} xs={12} sm={8} lg={4}>
            <Card bordered={false} className='rd-12px text-center' style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <Statistic title={c.title} value={c.value} />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default EnterpriseUsagePage;
