import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Typography } from '@arco-design/web-react';
import { Right, Setting } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

type WorkspaceEntry = {
  workspace: string;
  displayName: string;
  latestConversationId?: string;
  latestConversationName?: string;
  time: number;
};

const WorkspacePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupedHistory, conversations } = useConversationHistoryContext();
  const { hasJoinedEnterprise, showEnterpriseAdminNav, tenantLabel } = useEditionFeatures();

  const workspaceEntries = useMemo<WorkspaceEntry[]>(() => {
    const map = new Map<string, WorkspaceEntry>();
    groupedHistory.timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type !== 'workspace' || !item.workspaceGroup) return;
        const group = item.workspaceGroup;
        const latest = group.conversations[0];
        map.set(group.workspace, {
          workspace: group.workspace,
          displayName: group.displayName,
          latestConversationId: latest?.id,
          latestConversationName: latest?.name,
          time: item.time,
        });
      });
    });

    // Fallback: some conversations might not be grouped (customWorkspace missing)
    // — still try to surface their workspace as an entry.
    conversations.forEach((c) => {
      const ws = c.extra?.workspace;
      const isCustom = Boolean(c.extra?.customWorkspace);
      if (!ws || !isCustom) return;
      if (map.has(ws)) return;
      map.set(ws, {
        workspace: ws,
        displayName: ws.split(/[\\/]/).filter(Boolean).pop() || ws,
        latestConversationId: c.id,
        latestConversationName: c.name,
        time: getActivityTime(c),
      });
    });

    return [...map.values()].toSorted((a, b) => b.time - a.time);
  }, [conversations, groupedHistory.timelineSections]);

  const enterpriseCards = useMemo(
    () =>
      [
        {
          key: 'overview',
          title: t('common.workspace.hub.enterpriseOverviewTitle', {
            defaultValue: '企业能力总览',
          }),
          description: t('common.workspace.hub.enterpriseOverviewDesc', {
            defaultValue: '打开企业协同、研发平台能力与组织治理入口。',
          }),
          path: '/enterprise',
        },
        {
          key: 'cteam',
          title: t('common.workspace.hub.enterpriseKanbanTitle', {
            defaultValue: 'CTeam 敏捷协同',
          }),
          description: t('common.workspace.hub.enterpriseKanbanDesc', {
            defaultValue: '进入需求协同、任务拆解与跨角色推进看板。',
          }),
          path: '/enterprise/cteam',
        },
        {
          key: 'pipeline',
          title: t('common.workspace.hub.enterprisePipelineTitle', {
            defaultValue: 'CCI 流水线',
          }),
          description: t('common.workspace.hub.enterprisePipelineDesc', {
            defaultValue: '进入流水线编排、执行与质量闸口。',
          }),
          path: '/enterprise/pipeline-editor',
        },
        {
          key: 'cagent',
          title: t('common.workspace.hub.enterpriseAgentTitle', {
            defaultValue: 'CAgent 智能助手',
          }),
          description: t('common.workspace.hub.enterpriseAgentDesc', {
            defaultValue: '把企业知识、工具连接与交付流程串成受控 AI 工作台。',
          }),
          path: '/enterprise/cagent',
        },
        showEnterpriseAdminNav
          ? {
              key: 'admin',
              title: t('common.workspace.hub.enterpriseAdminTitle', {
                defaultValue: '组织管理后台',
              }),
              description: t('common.workspace.hub.enterpriseAdminDesc', {
                defaultValue: '成员、LDAP、飞书、邀请码、邮箱配置等组织治理入口。',
              }),
              path: '/enterprise/auth',
            }
          : null,
      ].filter((item): item is { key: string; title: string; description: string; path: string } => Boolean(item)),
    [showEnterpriseAdminNav, t]
  );

  return (
    <div className='h-full w-full overflow-auto px-20px py-16px'>
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <div className='text-18px font-bold text-t-primary'>{t('nav.workspace', { defaultValue: '工作区（文件）' })}</div>
          <div className='text-12px text-t-tertiary mt-4px'>
            {t('workspace.hub.subtitle', { defaultValue: '以项目/文件夹为中心管理会话与项目相关配置。' })}
          </div>
        </div>
        <Button
          icon={<Setting theme='outline' size='16' />}
          onClick={() => {
            void navigate('/workspace/settings');
          }}
        >
          {t('workspace.hub.projectSettings', { defaultValue: '项目设置' })}
        </Button>
      </div>

      {hasJoinedEnterprise ? (
        <div className='mt-16px mb-20px'>
          <div className='flex items-center justify-between gap-12px flex-wrap mb-10px'>
            <div className='min-w-0'>
              <div className='text-13px font-bold text-t-secondary'>
                {t('common.workspace.hub.enterpriseTitle', {
                  defaultValue: '企业协同与平台能力',
                })}
              </div>
              <div className='text-12px text-t-tertiary mt-4px'>
                {t('common.workspace.hub.enterpriseDesc', {
                  defaultValue:
                    '已加入 {{tenant}}。现在可以从主工作台直接进入企业协同与平台能力，不必先切到独立管理页。',
                  tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '企业版' }),
                })}
              </div>
            </div>
          </div>
          <div className='grid gap-10px md:grid-cols-2 xl:grid-cols-3'>
            {enterpriseCards.map((card) => (
              <Card
                key={card.key}
                className='border border-solid border-[var(--color-border-2)] rd-12px'
                bodyStyle={{ padding: 16 }}
                hoverable
              >
                <div className='flex h-full flex-col gap-10px'>
                  <div className='text-14px font-semibold text-t-primary'>{card.title}</div>
                  <Typography.Paragraph type='secondary' className='mb-0 text-12px'>
                    {card.description}
                  </Typography.Paragraph>
                  <div className='pt-2px'>
                    <Button
                      type='outline'
                      size='small'
                      onClick={() => {
                        void navigate(card.path);
                      }}
                    >
                      {t('common.workspace.hub.openEnterpriseCard', { defaultValue: '进入' })}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div className='mt-16px'>
        <div className='text-13px font-bold text-t-secondary mb-10px'>
          {t('workspace.hub.recentWorkspaces', { defaultValue: '最近工作区' })}
        </div>

        {workspaceEntries.length === 0 ? (
          <Empty
            description={
              <div className='space-y-10px text-center'>
                <div className='text-14px font-medium text-t-secondary'>
                  {t('workspace.hub.empty', { defaultValue: '暂无工作区记录' })}
                </div>
                <div className='text-12px text-t-tertiary max-w-360px mx-auto'>
                  {t('workspace.hub.emptyHint', {
                    defaultValue: '新用户这里会是空的。建议先创建一个会话并选择/打开工作区，之后最近工作区会自动出现在这里。',
                  })}
                </div>
                <div className='flex items-center justify-center gap-10px pt-8px'>
                  <Button
                    type='primary'
                    onClick={() => {
                      void navigate('/sessions');
                    }}
                  >
                    {t('workspace.hub.goToNewChat', { defaultValue: '去创建会话' })}
                  </Button>
                  <Button
                    onClick={() => {
                      void navigate('/workspace/settings');
                    }}
                  >
                    {t('workspace.hub.goToProjectSettings', { defaultValue: '项目设置' })}
                  </Button>
                </div>
              </div>
            }
          />
        ) : (
          <div className='grid gap-10px'>
            {workspaceEntries.slice(0, 8).map((w) => (
              <div
                key={w.workspace}
                className='px-14px py-12px rd-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-1)] hover:bg-fill-2 transition-colors cursor-pointer'
                onClick={() => {
                  if (w.latestConversationId) {
                    void navigate(`/conversation/${w.latestConversationId}`);
                  }
                }}
              >
                <div className='flex items-center justify-between gap-12px'>
                  <div className='min-w-0'>
                    <div className='text-14px font-medium text-t-primary truncate'>{w.displayName}</div>
                    <Typography.Ellipsis className='text-12px text-t-tertiary mt-4px max-w-full'>
                      {w.latestConversationName || w.workspace}
                    </Typography.Ellipsis>
                  </div>
                  <div className='shrink-0 text-t-secondary'>
                    <Right theme='outline' size='16' />
                  </div>
                </div>
              </div>
            ))}
            {workspaceEntries.length > 8 ? (
              <div className='text-12px text-t-tertiary px-4px'>
                {t('workspace.hub.moreHint', { defaultValue: '更多工作区可通过会话记录中的工作区分组访问。' })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspacePage;

