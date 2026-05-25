/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Grid, Space, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useEnterpriseRuntime } from '@/renderer/hooks/enterprise/useEnterpriseRuntime';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';

const { Row, Col } = Grid;

type CapabilityCard = {
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
};

const CAgentWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const runtime = useEnterpriseRuntime();
  const { enterpriseContext } = useWebuiEnterpriseMode();

  const capabilityCards: CapabilityCard[] = [
    {
      title: '企业知识检索',
      description: '把 RAG、MCP、Skills 和当前企业租户上下文串起来，作为企业助手的受控知识底座。',
      action: () => void navigate('/enterprise/rag'),
      actionLabel: '配置知识与工具',
    },
    {
      title: '交付链路协同',
      description: '从 CTeam 需求、CCode 仓库、CTest 计划到 CCI 流水线，形成可追踪的任务编排入口。',
      action: () => void navigate('/enterprise/cteam'),
      actionLabel: '查看交付链路',
    },
    {
      title: '受控执行入口',
      description: '企业成员从个人会话进入 Agent 工作台，但继承企业权限、租户边界和模块上下文。',
      action: () => void navigate('/sessions'),
      actionLabel: '打开 Agent 工作台',
    },
  ];

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
        <div>
          <Typography.Title heading={5} className='mt-0 mb-4px'>
            {t('admin.cagent.title', { defaultValue: 'CAgent 研发智能助手' })}
          </Typography.Title>
          <Typography.Paragraph type='secondary' className='mb-0 text-13px'>
            {t('admin.cagent.desc', {
              defaultValue:
                '把企业知识、工具连接与交付流程串成一个受控的 AI 助手入口，避免个人空间与企业空间割裂。',
            })}
          </Typography.Paragraph>
        </div>
        <Space>
          <Tag color='arcoblue'>
            {t('admin.cagent.tenant', {
              defaultValue: '当前租户：{{tenant}}',
              tenant: enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? 'default',
            })}
          </Tag>
          <Button type='primary' onClick={() => void navigate('/sessions')}>
            {t('admin.cagent.openWorkspace', { defaultValue: '进入 Agent 工作台' })}
          </Button>
        </Space>
      </div>

      <Card bordered={false} className='rd-12px mb-16px'>
        <Space direction='vertical' size={12} className='w-full'>
          <Typography.Text className='text-14px font-600'>
            {t('admin.cagent.runtimeTitle', { defaultValue: '企业受控运行时' })}
          </Typography.Text>
          <div className='flex gap-8px flex-wrap'>
            <Tag color={runtime.joined ? 'green' : 'red'}>
              {runtime.joined
                ? t('admin.cagent.joined', { defaultValue: '已接入企业' })
                : t('admin.cagent.notJoined', { defaultValue: '未接入企业' })}
            </Tag>
            <Tag color={runtime.status === 'ready' ? 'arcoblue' : 'orange'}>
              {t('admin.cagent.runtimeStatus', {
                defaultValue: '运行时状态：{{status}}',
                status: runtime.status,
              })}
            </Tag>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        {capabilityCards.map((card) => (
          <Col key={card.title} xs={24} md={8}>
            <Card bordered={false} className='rd-12px h-full'>
              <Space direction='vertical' size={12} className='w-full'>
                <Typography.Text className='text-14px font-600'>{card.title}</Typography.Text>
                <Typography.Paragraph type='secondary' className='mb-0'>
                  {card.description}
                </Typography.Paragraph>
                <Button type='outline' onClick={card.action}>
                  {card.actionLabel}
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </AdminPageWrapper>
  );
};

export default CAgentWorkspace;
