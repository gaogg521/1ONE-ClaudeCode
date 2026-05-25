/**
 * Enterprise Usage Statistics Page
 */
import React, { useCallback } from 'react';
import { Card, Grid, Statistic } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';
import {
  listAdminUsers,
  listMcpRegistry,
  listPipelines,
  listRagDocuments,
  listSkills,
} from '@/renderer/utils/enterpriseApi/modules';
const { Row, Col } = Grid;

const DEFAULT_USAGE_STATS = {
  users: 0,
  pipelines: 0,
  ragDocs: 0,
  mcpTools: 0,
  skills: 0,
};

const EnterpriseUsagePage: React.FC = () => {
  const { t } = useTranslation();
  const loadStats = useCallback(async () => {
    const [users, pipelines, ragDocuments, mcpTools, skills] = await Promise.all([
      listAdminUsers(),
      listPipelines(),
      listRagDocuments(),
      listMcpRegistry(),
      listSkills(),
    ]);

    return {
      users: users.length,
      pipelines: pipelines.length,
      ragDocs: ragDocuments.reduce((sum, doc) => sum + (Number(doc.chunk_count) || 0), 0),
      mcpTools: mcpTools.filter((item) => Boolean(item.enabled)).length,
      skills: skills.length,
    };
  }, []);
  const statsState = useEnterpriseAsyncData(
    loadStats,
    DEFAULT_USAGE_STATS,
    t('admin.usage.loadFailed', { defaultValue: '加载企业使用统计失败' })
  );

  const cards = [
    { title: '企业成员', value: statsState.data.users },
    { title: 'RAG 知识切片', value: statsState.data.ragDocs },
    { title: 'MCP 工具', value: statsState.data.mcpTools },
    { title: 'Skills 技能', value: statsState.data.skills },
    { title: '流水线数量', value: statsState.data.pipelines },
  ];

  return (
    <AdminPageWrapper>
      <div className='max-w-1200px mx-auto'>
        <ModulePageHeader
          title={t('settings.enterpriseConsole.navUsage', { defaultValue: '使用统计' })}
          description={t('admin.usage.desc', {
            defaultValue: '企业资源使用全景，实时统计各模块活跃数据。',
          })}
        />
        <ModuleDataState
          loading={statsState.loading}
          error={statsState.error}
          empty={false}
          emptyDescription=''
        >
          <Row gutter={[16, 16]}>
            {cards.map((card) => (
              <Col key={card.title} xs={12} sm={8} lg={6}>
                <Card
                  bordered={false}
                  className='rd-12px text-center'
                  style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                >
                  <Statistic title={card.title} value={card.value} />
                </Card>
              </Col>
            ))}
          </Row>
        </ModuleDataState>
      </div>
    </AdminPageWrapper>
  );
};

export default EnterpriseUsagePage;
