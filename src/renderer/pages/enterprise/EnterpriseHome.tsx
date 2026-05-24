/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Card, Grid, Message, PageHeader, Space, Spin, Statistic, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Book,
  EveryUser,
  Globe,
  Lock,
  Mail,
  Peoples,
  Plug,
  Right,
  Thunderbolt,
  TicketOne,
} from '@icon-park/react';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { ENTERPRISE_NAV_ITEMS } from '@/renderer/pages/enterprise/enterpriseNav';
import type { EnterpriseNavKey } from '@/renderer/pages/enterprise/enterpriseNav';

const { Row, Col } = Grid;

const CARD_ICONS: Record<EnterpriseNavKey, React.ReactNode> = {
  home: <Globe theme='outline' size={18} />,
  users: <EveryUser theme='outline' size={18} />,
  teams: <Peoples theme='outline' size={18} />,
  auth: <Mail theme='outline' size={18} />,
  invites: <TicketOne theme='outline' size={18} />,
  rag: <Book theme='outline' size={18} />,
  mcp: <Plug theme='outline' size={18} />,
  skills: <Thunderbolt theme='outline' size={18} />,
  'pipeline-editor': <Thunderbolt theme='outline' size={18} />,
  milestones: <Thunderbolt theme='outline' size={18} />,
  cpack: <Thunderbolt theme='outline' size={18} />,
  ccode: <Thunderbolt theme='outline' size={18} />,
  cmeas: <Thunderbolt theme='outline' size={18} />,
  ctest: <Thunderbolt theme='outline' size={18} />,
  cflow: <Thunderbolt theme='outline' size={18} />,
  usage: <Peoples theme='outline' size={18} />,
  security: <Lock theme='outline' size={18} />,
};

const EnterpriseHome: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enterpriseContext } = useWebuiEnterpriseMode();

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [metrics, setMetrics] = useState({
    userCount: 0,
    mcpCount: 0,
    ragCount: 0,
  });

  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';

  // 获取后台的核心健康指标
  useEffect(() => {
    const loadMetrics = async (): Promise<void> => {
      try {
        const [usersRes, mcpRes, ragRes] = await Promise.all([
          fetchWebuiApiJson<{ success: boolean; data: any[] }>('/api/admin/users').catch((): null => null),
          fetchWebuiApiJson<{ success: boolean; data: any[] }>('/api/admin/mcp/registry').catch((): null => null),
          fetchWebuiApiJson<{ success: boolean; data: any[] }>('/api/admin/rag/documents').catch((): null => null),
        ]);

        setMetrics({
          userCount: usersRes?.success ? (usersRes.data ?? []).length : 0,
          mcpCount: mcpRes?.success ? (mcpRes.data ?? []).filter((m: any): boolean => !!m.enabled).length : 0,
          ragCount: ragRes?.success ? (ragRes.data ?? []).reduce((sum: number, d: any): number => sum + (Number(d.chunk_count) || 0), 0) : 0,
        });
      } catch { /* ignore */ } finally {
        setLoadingMetrics(false);
      }
    };
    void loadMetrics();
  }, []);

  const menuCards = ENTERPRISE_NAV_ITEMS.filter((item) => item.key !== 'home');

  return (
    <div className='max-w-1200px mx-auto w-full px-4px pb-40px'>
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
              {t('settings.enterpriseConsole.desktopKicker', { defaultValue: '企业级研发控制台' })}
            </div>
            <Typography.Title heading={4} style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
              {tenantLabel}
            </Typography.Title>
          </div>
        </div>
        {/* 背景轻量装饰圈 */}
        <div className='absolute -right-40px -top-40px w-200px h-200px rd-full bg-white/5 pointer-events-none' />
        <div className='absolute right-120px -bottom-60px w-140px h-140px rd-full bg-white/5 pointer-events-none' />
      </div>

      {/* 2. 核心效能与资产指标卡 (3大指标大屏) */}
      {loadingMetrics ? (
        <div className='flex justify-center py-40px'>
          <Spin />
        </div>
      ) : (
        <Row gutter={[16, 16]} className='mb-24px'>
          <Col xs={24} sm={8}>
            <Card
              bordered={false}
              className='rd-12px transition-all hover:-translate-y-2px'
              style={{
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <Statistic
                title={t('settings.enterpriseConsole.metricUsers', { defaultValue: '活跃成员与组织架构' })}
                value={metrics.userCount}
                prefix={<EveryUser theme='outline' size={18} className='text-blue-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricUsersSuffix', { defaultValue: '人' })}
                style={{ color: 'rgb(var(--primary-6))', fontWeight: 'bold' } as React.CSSProperties}
                extra={<span className='text-11px text-t-tertiary'>基于 LDAP / 飞书 实时同步</span>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
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
                value={metrics.mcpCount}
                prefix={<Plug theme='outline' size={18} className='text-green-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricMcpsSuffix', { defaultValue: '个' })}
                style={{ color: '#00b42a', fontWeight: 'bold' } as React.CSSProperties}
                extra={<span className='text-11px text-t-tertiary'>外部集成安全代理连通</span>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
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
                value={metrics.ragCount}
                prefix={<Book theme='outline' size={18} className='text-amber-500 mr-8px' />}
                suffix={t('settings.enterpriseConsole.metricRagsSuffix', { defaultValue: '条' })}
                style={{ color: '#ff7d00', fontWeight: 'bold' } as React.CSSProperties}
                extra={<span className='text-11px text-t-tertiary'>全离线 WASM 语义向量模型</span>}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 3. 极简、严谨的后台管理快捷菜单 ( Arcodegree Border & Rounded-12px ) */}
      <Typography.Title heading={6} className='mt-0 mb-16px text-14px font-700 text-t-secondary uppercase tracking-wider'>
        {t('settings.enterpriseConsole.menuTitle', { defaultValue: '组织架构与系统配置配置' })}
      </Typography.Title>

      <Row gutter={[16, 16]}>
        {menuCards.map((item) => (
          <Col key={item.key} xs={24} sm={12} lg={8}>
            <Card
              className='cursor-pointer h-full rd-12px border border-solid border-border-2 hover:border-primary transition-all hover:-translate-y-2px'
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.02)' }}
              bodyStyle={{ padding: '16px 20px' }}
              hoverable
              onClick={() => void navigate(item.path)}
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
    </div>
  );
};

export default EnterpriseHome;
