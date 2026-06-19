import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Typography } from '@arco-design/web-react';
import { Right, Setting } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { openAdminConsole } from '@/renderer/utils/openAdminConsole';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { getProjectDisplayName, readPinnedProjects } from '@/renderer/utils/workspace/pinnedProjects';

const LAST_ACTIVE_TEAM_SCOPE_STORAGE_KEY = 'workspace:last-active-team-scope';

type WorkspaceEntry = {
  workspace: string;
  displayName: string;
  latestOpenPath?: string;
  latestConversationName?: string;
  time: number;
};

type LastActiveTeamScope = {
  teamId: string;
  teamName?: string;
};

function readLastActiveTeamScope(): LastActiveTeamScope | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ACTIVE_TEAM_SCOPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { teamId?: unknown; teamName?: unknown };
    if (typeof parsed.teamId !== 'string' || parsed.teamId.length === 0) {
      return null;
    }
    return {
      teamId: parsed.teamId,
      teamName: typeof parsed.teamName === 'string' && parsed.teamName.length > 0 ? parsed.teamName : undefined,
    };
  } catch {
    return null;
  }
}

function buildSharedWorkspaceScopePath(path: '/sessions' | '/tasks', scope: LastActiveTeamScope | null): string {
  const params = new URLSearchParams({ scope: 'team' });
  if (scope?.teamId) {
    params.set('teamId', scope.teamId);
  }
  if (scope?.teamName) {
    params.set('teamName', scope.teamName);
  }
  return `${path}?${params.toString()}`;
}

function readConversationTeamId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== 'object') {
    return undefined;
  }
  const teamId = (extra as { teamId?: unknown }).teamId;
  return typeof teamId === 'string' && teamId.length > 0 ? teamId : undefined;
}

function getConversationOpenPath(conversation: { id: string; extra?: unknown }): string {
  const teamId = readConversationTeamId(conversation.extra);
  if (teamId) {
    return `/team/${teamId}`;
  }
  return `/conversation/${conversation.id}`;
}

const WorkspacePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { groupedHistory, conversations } = useConversationHistoryContext();
  const {
    showTeamsFeature,
    showEnterpriseAdminNav,
    showEnterpriseWorkspaceHub,
    tenantLabel,
  } = useEditionFeatures();
  const { openEnterpriseAdminInBrowser } = useWebuiEnterpriseMode();
  const lastActiveTeamScope = useMemo(() => readLastActiveTeamScope(), []);

  const handleEnterpriseCardClick = useCallback(
    (card: { key: string; path: string }) => {
      if (card.key === 'admin') {
        void openAdminConsole({
          navigate: (path) => {
            void navigate(path);
          },
          openEnterpriseAdminInBrowser,
        });
        return;
      }
      void navigate(card.path);
    },
    [navigate, openEnterpriseAdminInBrowser]
  );

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
          latestOpenPath: latest ? getConversationOpenPath(latest) : undefined,
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
        latestOpenPath: getConversationOpenPath(c),
        latestConversationName: c.name,
        time: getActivityTime(c),
      });
    });

    readPinnedProjects().forEach((workspace, index) => {
      if (map.has(workspace)) return;
      map.set(workspace, {
        workspace,
        displayName: getProjectDisplayName(workspace),
        latestOpenPath: undefined,
        latestConversationName: undefined,
        time: Date.now() - index,
      });
    });

    return [...map.values()].toSorted((a, b) => b.time - a.time);
  }, [conversations, groupedHistory.timelineSections]);

  const enterpriseCards = useMemo(
    () =>
      [
        showTeamsFeature
          ? {
          key: 'overview',
          title: t('common.workspace.hub.enterpriseOverviewTitle', {
            defaultValue: '企业能力总览',
          }),
          description: t('common.workspace.hub.enterpriseOverviewDesc', {
            defaultValue: '打开企业协同、研发平台能力与组织治理入口。',
          }),
          path: '/enterprise',
        }
          : null,
        {
          key: 'cteam',
          title: t('common.workspace.hub.enterpriseKanbanTitle', {
            defaultValue: '敏捷 Issues',
          }),
          description: t('common.workspace.hub.enterpriseKanbanDesc', {
            defaultValue: '与侧栏 Issues 相同的需求工作台，查看状态、拆解结果与协作评论。',
          }),
          path: '/issues',
        },
        showTeamsFeature
          ? {
          key: 'shared-sessions',
          title: t('common.workspace.hub.enterpriseSharedSessionsTitle', {
            defaultValue: '共享会话',
          }),
          description: t('common.workspace.hub.enterpriseSharedSessionsDesc', {
            defaultValue: '直接进入主工作台里的团队协同会话范围。',
          }),
          path: buildSharedWorkspaceScopePath('/sessions', lastActiveTeamScope),
        }
          : null,
        showTeamsFeature
          ? {
          key: 'shared-tasks',
          title: t('common.workspace.hub.enterpriseSharedTasksTitle', {
            defaultValue: '共享任务',
          }),
          description: t('common.workspace.hub.enterpriseSharedTasksDesc', {
            defaultValue: '直接进入主工作台里的团队协同任务范围。',
          }),
          path: buildSharedWorkspaceScopePath('/tasks', lastActiveTeamScope),
        }
          : null,
        {
          key: 'cagent',
          title: t('common.workspace.hub.enterpriseAgentTitle', {
            defaultValue: 'Agent 助手',
          }),
          description: t('common.workspace.hub.enterpriseAgentDesc', {
            defaultValue: '直接处理当前 Issue、查看运行结果，并在需要时进入协作调度。',
          }),
          path: '/super-assistant?tab=overview',
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
              path: '/enterprise',
            }
          : null,
        showEnterpriseAdminNav
          ? {
              key: 'pipeline',
              title: t('common.workspace.hub.enterprisePipelineTitle', {
                defaultValue: 'CCI 流水线',
              }),
              description: t('common.workspace.hub.enterprisePipelineDesc', {
                defaultValue: '进入流水线编排、执行与质量闸口。',
              }),
              path: '/enterprise/pipeline-editor',
            }
          : null,
      ].filter((item): item is { key: string; title: string; description: string; path: string } => Boolean(item)),
    [lastActiveTeamScope, showEnterpriseAdminNav, showTeamsFeature, t]
  );

  return (
    <PageContentShell className='workspace-page-shell' contentClassName='md:max-w-1200px'>
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
            void navigate('/workspace/settings/projects');
          }}
        >
          {t('workspace.hub.projectSettings', { defaultValue: '项目设置' })}
        </Button>
      </div>

      {showEnterpriseWorkspaceHub ? (
        <div className='mt-16px mb-20px'>
          <div className='flex items-center justify-between gap-12px flex-wrap mb-10px'>
            <div className='min-w-0'>
              <div className='text-13px font-bold text-t-secondary'>
                {t('common.workspace.hub.enterpriseTitle', {
                  defaultValue: '企业协同与平台能力',
                })}
              </div>
              <div className='text-12px text-t-tertiary mt-4px'>
                {auth.status === 'authenticated'
                  ? t('common.workspace.hub.enterpriseDesc', {
                      defaultValue:
                        '已加入 {{tenant}}。现在可以从主工作台直接进入企业协同与平台能力，不必先切到独立管理页。',
                      tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' }),
                    })
                  : t('common.workspace.hub.enterpriseInstanceDesc', {
                      defaultValue:
                        '当前实例已接入 {{tenant}}。登录企业账号后，即可从主工作台直接进入企业协同与平台能力。',
                      tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' }),
                    })}
              </div>
            </div>
          </div>
          <div className='grid gap-10px md:grid-cols-2 xl:grid-cols-3'>
            {enterpriseCards.map((card) => (
              <Card
                key={card.key}
                className='border border-solid border-[var(--color-border-2)] rd-12px cursor-pointer'
                bodyStyle={{ padding: 16 }}
                hoverable
                onClick={() => {
                  handleEnterpriseCardClick(card);
                }}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEnterpriseCardClick(card);
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
                      void navigate('/workspace/settings/projects');
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
                  if (w.latestOpenPath) {
                    void navigate(w.latestOpenPath);
                    return;
                  }
                  void navigate('/guid', { state: { workspace: w.workspace } });
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
    </PageContentShell>
  );
};

export default WorkspacePage;

