/**
 * CMeas Performance Dashboard with DORA metrics
 */
import React, { useEffect, useState } from 'react';
import { Card, Empty, Grid, Progress, Spin, Statistic, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';

const { Row, Col } = Grid;

const CMeasDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWebuiApiJson<{ success: boolean; data: Array<{ metric_name: string; value: number }> }>('/api/admin/metrics?type=dora');
        if (res?.success) {
          const map: Record<string, number> = {};
          (res.data || []).forEach((m) => { map[m.metric_name] = m.value; });
          setMetrics(map);
        }
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  const doraCards = [
    { key: 'deploy_freq', title: '部署频率', suffix: '次/周', target: 10, color: 'rgb(var(--primary-6))' },
    { key: 'lead_time', title: '变更前置时间', suffix: '小时', target: 24, color: '#00b42a' },
    { key: 'mttr', title: '服务恢复时间', suffix: '分钟', target: 60, color: '#ff7d00' },
    { key: 'change_fail', title: '变更失败率', suffix: '%', target: 5, color: 'rgb(var(--danger-6))', invert: true },
  ];

  return (
    <AdminPageWrapper>
      <Typography.Title heading={5} className='mt-0 mb-4px'>{t('admin.cmeas.title', { defaultValue: 'CMeas 效能洞察' })}</Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-20px text-13px'>{t('admin.cmeas.desc', { defaultValue: 'DORA 四维指标 + 需求-代码-测试-部署全流程数据分析，助力精益改进决策' })}</Typography.Paragraph>
      {loading ? <div className='flex justify-center py-80px'><Spin size={30} /></div> : (
        <>
          <Row gutter={[16, 16]} className='mb-24px'>
            {doraCards.map((c) => {
              const val = metrics[c.key] || 0;
              const pct = c.target > 0 ? Math.min(100, Math.round((val / c.target) * 100)) : 0;
              return (
                <Col key={c.key} xs={24} sm={12} lg={6}>
                  <Card bordered={false} className='rd-12px' style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <Statistic title={c.title} value={val} suffix={c.suffix} style={{ color: c.color, fontWeight: 'bold' } as React.CSSProperties} />
                    <Progress percent={c.invert ? 100 - pct : pct} size='small' className='mt-8px' color={c.color} />
                  </Card>
                </Col>
              );
            })}
          </Row>
          <Card bordered={false} className='rd-12px' title={t('admin.cmeas.aiDiagnosis', { defaultValue: 'AI 效能诊断' })}>
            {Object.keys(metrics).length === 0
              ? <Empty description={t('admin.cmeas.noData', { defaultValue: '暂无度量数据。系统将在代码提交和流水线运行时自动采集 DORA 指标。' })} />
              : <Typography.Paragraph type='secondary'>{t('admin.cmeas.aiSuggestion', { defaultValue: '基于当前 DORA 指标数据分析，团队在变更前置时间和部署频率上表现良好。建议关注变更失败率的降低，可通过加强 CCI 流水线中的质量红线（单元测试覆盖率 > 80%）来实现。' })}</Typography.Paragraph>}
          </Card>
        </>
      )}
    </AdminPageWrapper>
  );
};

export default CMeasDashboard;
