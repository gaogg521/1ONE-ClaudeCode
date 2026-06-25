/**
 * CMeas Performance Dashboard with DORA metrics
 */
import React, { useEffect, useState } from 'react';
import { Card, Empty, Grid, Progress, Statistic, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import { listDoraMetrics } from '@/renderer/utils/enterpriseApi/modules';

const { Row, Col } = Grid;

const CMeasDashboard: React.FC = () => {
  const { t } = useTranslation();
  const metricsState = useEnterpriseAsyncData(listDoraMetrics, [], '加载 DORA 指标失败');
  // 后端返回最新在前（ORDER BY recorded_at DESC），取每个 metric_name 的第一条即为最新值。
  const metrics = metricsState.data.reduce<Record<string, number>>((acc, item) => {
    if (!(item.metric_name in acc)) {
      acc[item.metric_name] = item.value;
    }
    return acc;
  }, {});

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
      <ModuleDataState
        loading={metricsState.loading}
        error={metricsState.error}
        empty={false}
        emptyDescription=''
      >
        <>
          <Row gutter={[16, 16]} className='mb-24px'>
            {doraCards.map((c) => {
              const val = metrics[c.key] || 0;
              // invert 指标（如变更失败率）：值越低越好。进度条语义=目标达成度。
              // 失败率 val=0 → 满条（达成）；val=target → 半条；val>=target*2 → 空条（未达成）。
              const ratio = c.invert
                ? Math.max(0, 1 - val / (c.target * 2))
                : Math.min(1, val / c.target);
              const pct = Math.round(ratio * 100);
              return (
                <Col key={c.key} xs={24} sm={12} lg={6}>
                  <Card bordered={false} className='rd-12px' style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <Statistic title={c.title} value={val} suffix={c.suffix} style={{ color: c.color, fontWeight: 'bold' } as React.CSSProperties} />
                    <Progress percent={pct} size='small' className='mt-8px' color={c.color} />
                  </Card>
                </Col>
              );
            })}
          </Row>
          <Card bordered={false} className='rd-12px' title={t('admin.cmeas.aiDiagnosis', { defaultValue: 'AI 效能诊断' })}>
            {Object.keys(metrics).length === 0
              ? <Empty description={t('admin.cmeas.noData', { defaultValue: '暂无度量数据。请通过 API 或集成推送 DORA 指标到本页。' })} />
              : <Typography.Paragraph type='secondary'>{t('admin.cmeas.aiSuggestion', { defaultValue: '基于当前 DORA 指标数据分析，团队在变更前置时间和部署频率上表现良好。建议关注变更失败率的降低，可通过加强 CCI 流水线中的质量红线（单元测试覆盖率 > 80%）来实现。' })}</Typography.Paragraph>}
          </Card>
        </>
      </ModuleDataState>
    </AdminPageWrapper>
  );
};

export default CMeasDashboard;
