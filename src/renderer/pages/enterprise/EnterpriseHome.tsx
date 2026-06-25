/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Button, Card, Grid, Statistic, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Analysis,
  Book,
  Calendar,
  CheckOne,
  Code,
  EveryUser,
  Exchange,
  Globe,
  Inbox,
  Lock,
  Mail,
  Peoples,
  Plug,
  Right,
  Robot,
  Server,
  Thunderbolt,
  TicketOne,
} from '@icon-park/react';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { useEnterpriseRuntime } from '@/renderer/hooks/enterprise/useEnterpriseRuntime';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { resolveEnterpriseTenantDisplayLabel } from '@/common/auth/enterpriseRoles';
import type { EnterpriseNavKey } from '@/renderer/pages/enterprise/enterpriseNav';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import {
  listCodeRepos,
  listMcpRegistry,
  listPipelines,
  listRagDocuments,
} from '@/renderer/utils/enterpriseApi/modules';

const { Row, Col } = Grid;

const DEFAULT_METRICS = {
  mcpCount: 0,
  ragCount: 0,
  pipelineCount: 0,
  repoCount: 0,
};

const CAPABILITY_KEYS = new Set<EnterpriseNavKey>([
  'cteam',
  'pipeline-editor',
  'cpack',
  'cmeas',
  'ccode',
]);

const CAPABILITY_SUMMARY: Partial<Record<EnterpriseNavKey, string>> = {
  cteam: '需求协同、任务拆解与跨角色推进。',
  'pipeline-editor': '流水线编排、运行与质量闸口。',
  cpack: '制品仓库、制品资产与分发出口。',
  cmeas: 'DORA 指标与交付效能分析。',
  ccode: '代码资产接入与交付链路关联。',
};

const CARD_ICONS: Record<EnterpriseNavKey, React.ReactNode> = {
  home: <Globe theme='outline' size={18} />,
  settings: <Lock theme='outline' size={18} />,
  users: <EveryUser theme='outline' size={18} />,
  teams: <Peoples theme='outline' size={18} />,
  runtimes: <Server theme='outline' size={18} />,
  auth: <Mail theme='outline' size={18} />,
  invites: <TicketOne theme='outline' size={18} />,
  cteam: <Peoples theme='outline' size={18} />,
  rag: <Book theme='outline' size={18} />,
  mcp: <Plug theme='outline' size={18} />,
  skills: <Thunderbolt theme='outline' size={18} />,
  'pipeline-editor': <Thunderbolt theme='outline' size={18} />,
  milestones: <Calendar theme='outline' size={18} />,
  cpack: <Inbox theme='outline' size={18} />,
  ccode: <Code theme='outline' size={18} />,
  cmeas: <Analysis theme='outline' size={18} />,
  usage: <Peoples theme='outline' size={18} />,
  security: <Lock theme='outline' size={18} />,
};

const EnterpriseHome: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enterpriseContext } = useWebuiEnterpriseMode();
  const runtime = useEnterpriseRuntime();
  const canViewMcp = runtime.visibleNavItems.some((item) => item.key === 'mcp');
  const canViewRag = runtime.visibleNavItems.some((item) => item.key === 'rag');
  const canViewPipeline = runtime.visibleNavItems.some((item) => item.key === 'pipeline-editor');
  const canViewCode = runtime.visibleNavItems.some((item) => item.key === 'ccode');
  const canViewOverviewMetrics = canViewMcp || canViewRag || canViewPipeline || canViewCode;
  const loadMetrics = useCallback(async () => {
    if (!canViewOverviewMetrics) {
      return DEFAULT_METRICS;
    }
    const [mcpRegistry, ragDocuments, pipelines, codeRepos] = await Promise.all([
      canViewMcp ? listMcpRegistry() : Promise.resolve([]),
      canViewRag ? listRagDocuments() : Promise.resolve([]),
      canViewPipeline ? listPipelines() : Promise.resolve([]),
      canViewCode ? listCodeRepos() : Promise.resolve([]),
    ]);
    return {
      mcpCount: mcpRegistry.filter((item) => Boolean(item.enabled)).length,
      ragCount: ragDocuments.reduce((sum, doc) => sum + (Number(doc.chunk_count) || 0), 0),
      pipelineCount: pipelines.length,
      repoCount: codeRepos.length,
    };
  }, [canViewOverviewMetrics, canViewMcp, canViewRag, canViewPipeline, canViewCode]);
  const metricsState = useEnterpriseAsyncData(
    loadMetrics,
    DEFAULT_METRICS,
    '加载企业概览指标失败'
  );

  const metricExtraText = {
    pipeline: canViewPipeline ? '持续集成编排与执行入口' : '当前角色暂无流水线概览权限',
    mcp: canViewMcp ? '外部集成安全代理连通' : '当前角色暂无 MCP 概览权限',
    rag: canViewRag ? '全离线 WASM 语义向量模型' : '当前角色暂无知识库概览权限',
    repo: canViewCode ? '代码资产已接入交付链路' : '当前角色暂无代码资产概览权限',
  };

  const tenantLabel = resolveEnterpriseTenantDisplayLabel(
    enterpriseContext?.tenantId,
    enterpriseContext?.tenantName
  );
  const handleOpenModule = useCallback(
    (path: string) => {
      void navigate(path);
    },
    [navigate]
  );

  const capabilityCards = runtime.visibleNavItems.filter((item) => CAPABILITY_KEYS.has(item.key));
  const foundationCards = runtime.visibleNavItems.filter(
    (item) => item.key !== 'home' && !CAPABILITY_KEYS.has(item.key)
  );

  return (
    <PageContentShell contentClassName='max-w-1200px pb-40px' disableOverflow>
      {/* 1. 现代头部 PageHeader (深邃靛蓝渐变) */}
      <div
        className='rd-12px p-24px mb-24px text-white relative overflow-hidden'
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%)',
          boxShadow: '0 8px 30px rgba(30, 27, 75, 0.25)',
        }}
      >
        <div className='flex items-center gap-16px relative z-10'>
          <div className='w-48px h-48px rd-10px flex items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 text-yellow-400'>
            <Globe theme='outline' size={24} />
          </div>
          <div>
            <div className='text-12px opacity-75 font-600 tracking-wider mb-2px uppercase'>
              {t('settings.enterpriseConsole.desktopKicker', { defaultValue: '企业团队研发控制台' })}
            </div>
            <Typography.Title heading={4} style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
              {tenantLabel}
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.78)', margin: '8px 0 0' }}>
              {t('settings.enterpriseConsole.sharedWorkspaceHint', {
                defaultValue: '日常会话、任务和共享工作区仍在主工作台中，下面可直接返回。',
              })}
            </Typography.Paragraph>
            <div className='mt-12px flex items-center gap-8px flex-wrap'>
              <Button size='small' onClick={() => handleOpenModule('/issues')}>
                {t('nav.issues', { defaultValue: 'Issues' })}
              </Button>
              <Button size='small' onClick={() => handleOpenModule('/sessions')}>
                {t('nav.sessions', { defaultValue: 'Sessions' })}
              </Button>
              <Button size='small' onClick={() => handleOpenModule('/super-assistant')}>
                {t('nav.agentAssistant', { defaultValue: 'Agent 助手' })}
              </Button>
              <Button size='small' onClick={() => handleOpenModule('/skills')}>
                {t('nav.skills', { defaultValue: 'Skills' })}
              </Button>
              <Button size='small' onClick={() => handleOpenModule('/workspace')}>
                {t('nav.workspace', { defaultValue: 'Workspace' })}
              </Button>
              <Button size='small' onClick={() => handleOpenModule('/tasks')}>
                {t('nav.tasks', { defaultValue: 'Tasks' })}
              </Button>
            </div>
          </div>
        </div>
        {/* 背景轻量装饰圈 */}
        <div className='absolute -right-40px -top-40px w-200px h-200px rd-full bg-white/5 pointer-events-none' />
        <div className='absolute right-120px -bottom-60px w-140px h-140px rd-full bg-white/5 pointer-events-none' />
      </div>

      {/* 2. 核心效能与资产指标卡 (3大指标大屏) */}
      <ModuleDataState
        loading={canViewOverviewMetrics ? metricsState.loading : false}
        error={metricsState.error}
        empty={false}
        emptyDescription=''
      >
        <Row gutter={[16, 16]} className='mb-24px'>
          <Col xs={24} sm={12} lg={6}>
            <Card
              bordered={false}
              className='rd-12px transition-all hover:-translate-y-2px'
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <Statistic
                title={t('settings.enterpriseConsole.metricPipelines', { defaultValue: 'CCI 流水线' })}
                value={canViewOverviewMetrics ? metricsState.data.pipelineCount : '--'}
                prefix={<Thunderbolt theme='outline' size={18} className='text-blue-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricPipelineSuffix', { defaultValue: '条' })}
                style={{ color: 'rgb(var(--primary-6))', fontWeight: 'bold' } as React.CSSProperties}
                extra={
                  <div className='flex items-center justify-between'>
                    <span className='text-11px text-t-tertiary'>{metricExtraText.pipeline}</span>
                    <Button
                      size='mini'
                      type='text'
                      className='text-11px'
                      onClick={() => handleOpenModule('/enterprise/pipeline-editor')}
                    >
                      <Tag size='small' color='orange' className='mr-4px'>
                        {t('settings.enterpriseConsole.experimental', { defaultValue: '实验性' })}
                      </Tag>
                      {t('settings.enterpriseConsole.openPipelineEditor', { defaultValue: '进入编排器' })}
                    </Button>
                  </div>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              bordered={false}
              className='rd-12px transition-all hover:-translate-y-2px'
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <Statistic
                title={t('settings.enterpriseConsole.metricMcps', { defaultValue: '已启用 MCP 工具连接数' })}
                value={canViewOverviewMetrics ? metricsState.data.mcpCount : '--'}
                prefix={<Plug theme='outline' size={18} className='text-green-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricMcpsSuffix', { defaultValue: '个' })}
                style={{ color: '#00b42a', fontWeight: 'bold' } as React.CSSProperties}
                extra={<span className='text-11px text-t-tertiary'>{metricExtraText.mcp}</span>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              bordered={false}
              className='rd-12px transition-all hover:-translate-y-2px'
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <Statistic
                title={t('settings.enterpriseConsole.metricRags', { defaultValue: 'RAG 离线语义知识切片' })}
                value={canViewOverviewMetrics ? metricsState.data.ragCount : '--'}
                prefix={<Book theme='outline' size={18} className='text-amber-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricRagsSuffix', { defaultValue: '条' })}
                style={{ color: '#ff7d00', fontWeight: 'bold' } as React.CSSProperties}
                extra={<span className='text-11px text-t-tertiary'>{metricExtraText.rag}</span>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              bordered={false}
              className='rd-12px transition-all hover:-translate-y-2px'
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <Statistic
                title={t('settings.enterpriseConsole.metricRepos', { defaultValue: 'CCode 已绑定仓库' })}
                value={canViewOverviewMetrics ? metricsState.data.repoCount : '--'}
                prefix={<EveryUser theme='outline' size={18} className='text-cyan-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricReposSuffix', { defaultValue: '个' })}
                style={{ color: '#0fc6c2', fontWeight: 'bold' } as React.CSSProperties}
                extra={<span className='text-11px text-t-tertiary'>{metricExtraText.repo}</span>}
              />
            </Card>
          </Col>
        </Row>
      </ModuleDataState>

      <Typography.Title heading={6} className='mt-0 mb-16px text-14px font-700 text-t-secondary uppercase tracking-wider'>
        {t('settings.enterpriseConsole.capabilityTitle', { defaultValue: '研发智能工作台' })}
      </Typography.Title>

      <Row gutter={[16, 16]} className='mb-24px'>
        {capabilityCards.map((item) => (
          <Col key={item.key} xs={24} sm={12} lg={6}>
            <Card
              className='cursor-pointer h-full rd-12px border border-solid border-border-2 hover:border-primary transition-all hover:-translate-y-2px'
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.02)' }}
              bodyStyle={{ padding: '16px 20px' }}
              hoverable
              onClick={() => handleOpenModule(item.path)}
            >
              <div className='flex flex-col gap-12px h-full'>
                <div className='flex items-center justify-between gap-12px'>
                  <div className='w-36px h-36px rd-8px flex items-center justify-center bg-fill-2 text-primary shrink-0'>
                    {CARD_ICONS[item.key]}
                  </div>
                </div>
                <div>
                  <div className='text-14px font-600 text-t-primary mb-6px'>
                    {t(item.labelKey, { defaultValue: item.labelDefault })}
                  </div>
                  <Typography.Paragraph type='secondary' className='mb-0 text-12px'>
                    {CAPABILITY_SUMMARY[item.key] ?? item.labelDefault}
                  </Typography.Paragraph>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 3. 极简、严谨的后台管理快捷菜单 ( Arcodegree Border & Rounded-12px ) */}
      <Typography.Title heading={6} className='mt-0 mb-16px text-14px font-700 text-t-secondary uppercase tracking-wider'>
        {t('settings.enterpriseConsole.menuTitle', { defaultValue: '组织管理与平台配置' })}
      </Typography.Title>

      <Row gutter={[16, 16]}>
        {foundationCards.map((item) => (
          <Col key={item.key} xs={24} sm={12} lg={8}>
            <Card
              className='cursor-pointer h-full rd-12px border border-solid border-border-2 hover:border-primary transition-all hover:-translate-y-2px'
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.02)' }}
              bodyStyle={{ padding: '16px 20px' }}
              hoverable
              onClick={() => handleOpenModule(item.path)}
            >
              <div className='flex items-center justify-between gap-12px'>
                <div className='flex items-center gap-12px min-w-0 flex-1'>
                  <div className='w-36px h-36px rd-8px flex items-center justify-center bg-fill-2 text-primary shrink-0'>
                    {CARD_ICONS[item.key]}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-8px mb-2px'>
                      <span className='text-14px font-600 text-t-primary truncate'>
                        {t(item.labelKey, { defaultValue: item.labelDefault })}
                      </span>
                      {item.comingSoon && (
                        <Tag size='small' color='gray' className='rd-10px scale-90 origin-left'>
                          {t('settings.enterpriseConsole.navComingSoon', { defaultValue: '即将推出' })}
                        </Tag>
                      )}
                    </div>
                  </div>
                </div>
                <Right theme='outline' size='14' className='text-t-tertiary group-hover:text-primary transition-colors' />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </PageContentShell>
  );
};

export default EnterpriseHome;
