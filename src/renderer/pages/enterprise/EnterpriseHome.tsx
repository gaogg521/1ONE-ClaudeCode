/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Card, Grid, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  EveryUser,
  Lock,
  Mail,
  Peoples,
  TicketOne,
  TrendTwo,
} from '@icon-park/react';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { formatEnterpriseRole } from '@/renderer/pages/enterprise/enterpriseElevationUi';
import { ENTERPRISE_NAV_ITEMS } from '@/renderer/pages/enterprise/enterpriseNav';
import type { EnterpriseNavKey } from '@/renderer/pages/enterprise/enterpriseNav';

const { Row, Col } = Grid;

const CARD_ICONS: Record<EnterpriseNavKey, React.ReactNode> = {
  home: <TrendTwo theme='outline' size={22} />,
  users: <EveryUser theme='outline' size={22} />,
  teams: <Peoples theme='outline' size={22} />,
  auth: <Mail theme='outline' size={22} />,
  invites: <TicketOne theme='outline' size={22} />,
  usage: <TrendTwo theme='outline' size={22} />,
  security: <Lock theme='outline' size={22} />,
};

const CARD_DESC_KEYS: Record<EnterpriseNavKey, { key: string; defaultValue: string }> = {
  home: { key: 'settings.enterpriseConsole.cardHomeDesc', defaultValue: '企业控制台总览与快捷入口。' },
  users: {
    key: 'settings.enterpriseConsole.cardUsersDesc',
    defaultValue: '管理成员账号、角色与外部身份绑定。',
  },
  teams: {
    key: 'settings.enterpriseConsole.cardTeamsDesc',
    defaultValue: '团队结构、权限与协作范围。',
  },
  auth: {
    key: 'settings.enterpriseConsole.cardAuthDesc',
    defaultValue: 'LDAP、飞书等登录方式与 SMTP 邮件配置。',
  },
  invites: {
    key: 'settings.enterpriseConsole.cardInvitesDesc',
    defaultValue: '生成与管理企业邀请码。',
  },
  usage: {
    key: 'settings.enterpriseConsole.cardUsageDesc',
    defaultValue: '成员使用情况与配额（即将推出）。',
  },
  security: {
    key: 'settings.enterpriseConsole.cardSecurityDesc',
    defaultValue: '安全策略、审计与合规（即将推出）。',
  },
};

const EnterpriseHome: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enterpriseContext } = useWebuiEnterpriseMode();

  const tenantLabel = enterpriseContext?.tenantName ?? enterpriseContext?.tenantId ?? '';
  const cards = ENTERPRISE_NAV_ITEMS.filter((item) => item.key !== 'home');

  return (
    <div className='max-w-1080px mx-auto w-full'>
      <Typography.Title heading={4} className='mt-0 mb-8px'>
        {t('settings.enterpriseConsole.homeTitle', { defaultValue: '企业控制台' })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-20px'>
        {t('settings.enterpriseConsole.homeWelcome', {
          defaultValue: '当前企业：{{tenant}}',
          tenant: tenantLabel,
        })}
      </Typography.Paragraph>
      <div className='mb-20px flex flex-wrap gap-8px items-center'>
        <Tag color='arcoblue'>{formatEnterpriseRole(user?.role, t)}</Tag>
        {user?.username ? <Tag>{user.username}</Tag> : null}
      </div>
      <Typography.Paragraph type='secondary' className='mb-24px'>
        {t('settings.enterpriseConsole.homeDesc', {
          defaultValue:
            '在此管理组织成员、团队、认证与邮件、邀请码等。与个人会话工作台分离，专注企业治理。',
        })}
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {cards.map((item) => {
          const desc = CARD_DESC_KEYS[item.key];
          return (
            <Col key={item.key} xs={24} sm={12} lg={8}>
              <Card
                className='cursor-pointer h-full rd-12px hover:shadow-sm transition-shadow'
                hoverable
                onClick={() => {
                  void navigate(item.path);
                }}
              >
                <div className='flex items-start gap-12px'>
                  <div className='text-[rgb(var(--primary-6))] shrink-0 pt-2px'>{CARD_ICONS[item.key]}</div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-8px mb-4px'>
                      <span className='text-15px font-600 text-t-primary'>
                        {t(item.labelKey, { defaultValue: item.labelDefault })}
                      </span>
                      {item.comingSoon ? (
                        <Tag size='small' color='gray'>
                          {t('settings.enterpriseConsole.navComingSoon', { defaultValue: '即将推出' })}
                        </Tag>
                      ) : null}
                    </div>
                    <Typography.Paragraph type='secondary' className='mb-0 text-13px'>
                      {t(desc.key, { defaultValue: desc.defaultValue })}
                    </Typography.Paragraph>
                  </div>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default EnterpriseHome;
