import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Message, Result, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { openAdminConsole } from '@/renderer/utils/openAdminConsole';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createTeamTask,
  deleteTeamTask,
  listTeamTasks,
  type TeamTaskRecord,
  updateRequirement,
  updateTeamTask,
} from '@/renderer/utils/enterpriseApi/modules';
import CreateSharedTaskModal from './components/CreateSharedTaskModal';
import SuperAssistantHeader from './components/SuperAssistantHeader';
import IssuesWorkbench from './components/IssuesWorkbench';
import AgentsTab from './components/AgentsTab';
import SkillsTab from './components/SkillsTab';
import RuntimesTab from './components/RuntimesTab';
import SettingsTab from './components/SettingsTab';
import type { SuperAssistantIssueAssignmentMap } from './hooks/useSuperAssistantData';
import { pickEnterpriseCollaborationContext } from './hooks/useEnterpriseCollaborationContext';
import { useSuperAssistantData } from './hooks/useSuperAssistantData';
import {
  buildIssueAssignmentPrompt,
  buildSuperAssistantAutopilotDefaults,
} from './utils/autopilotDefaults';

type NavigationIssueContext = {
  id: string;
  subject: string;
} | null;

type NavigationTeamContext = {
  id: string;
  name: string;
} | null;

type SuperAssistantTab = 'overview' | 'issues' | 'skills' | 'runtimes' | 'settings';

type SuperAssistantIssueTaskMetadata = {
  source: 'super-assistant-issue';
  issueId: string;
  issueSubject: string;
  slotId: string;
  agentName: string;
  manualStatus?: SuperAssistantIssueAssignmentMap[string]['manualStatus'];
  manualBlockerMessage?: string | null;
};

function appendIssueContext(params: URLSearchParams, issue: NavigationIssueContext): void {
  if (!issue) {
    return;
  }
  params.set('issueId', issue.id);
  params.set('issueSubject', issue.subject);
}

function appendTeamContext(params: URLSearchParams, team: NavigationTeamContext): void {
  if (!team) {
    return;
  }
  params.set('teamId', team.id);
  params.set('teamName', team.name);
}

function buildTeamScopedPath(
  path: '/tasks' | '/sessions',
  teamId?: string,
  teamName?: string,
  issue?: NavigationIssueContext
): string {
  const params = new URLSearchParams({ scope: 'team' });
  if (teamId) {
    params.set('teamId', teamId);
  }
  if (teamName && teamId) {
    params.set('teamName', teamName);
  }
  appendIssueContext(params, issue ?? null);
  return `${path}?${params.toString()}`;
}

function buildKanbanPath(issue?: NavigationIssueContext, team?: NavigationTeamContext): string {
  if (!issue && !team) {
    return '/enterprise/cteam';
  }
  const params = new URLSearchParams();
  appendTeamContext(params, team ?? null);
  appendIssueContext(params, issue ?? null);
  return `/enterprise/cteam?${params.toString()}`;
}

function buildTeamPath(teamId: string, issue?: NavigationIssueContext, agentSlotId?: string): string {
  if (!issue) {
    return `/team/${teamId}`;
  }
  const params = new URLSearchParams();
  appendIssueContext(params, issue);
  if (agentSlotId) {
    params.set('agentSlotId', agentSlotId);
  }
  return `/team/${teamId}?${params.toString()}`;
}

function parseIssueTaskMetadata(task: TeamTaskRecord): SuperAssistantIssueTaskMetadata | null {
  const rawMetadata = task.metadata;
  const parsedMetadata =
    typeof rawMetadata === 'string'
      ? (() => {
          try {
            return JSON.parse(rawMetadata) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : rawMetadata && typeof rawMetadata === 'object'
        ? (rawMetadata as Record<string, unknown>)
        : null;
  if (!parsedMetadata || parsedMetadata.source !== 'super-assistant-issue') {
    return null;
  }
  if (
    typeof parsedMetadata.issueId !== 'string' ||
    typeof parsedMetadata.issueSubject !== 'string' ||
    typeof parsedMetadata.slotId !== 'string' ||
    typeof parsedMetadata.agentName !== 'string'
  ) {
    return null;
  }
  return {
    source: 'super-assistant-issue',
    issueId: parsedMetadata.issueId,
    issueSubject: parsedMetadata.issueSubject,
    slotId: parsedMetadata.slotId,
    agentName: parsedMetadata.agentName,
    manualStatus:
      parsedMetadata.manualStatus === 'pending' ||
      parsedMetadata.manualStatus === 'idle' ||
      parsedMetadata.manualStatus === 'active' ||
      parsedMetadata.manualStatus === 'completed' ||
      parsedMetadata.manualStatus === 'failed'
        ? parsedMetadata.manualStatus
        : undefined,
    manualBlockerMessage:
      typeof parsedMetadata.manualBlockerMessage === 'string'
        ? parsedMetadata.manualBlockerMessage
        : parsedMetadata.manualBlockerMessage === null
          ? null
          : null,
  };
}

function parseSuperAssistantSearch(search: string): {
  issueId: string | null;
  tab: SuperAssistantTab;
} {
  const params = new URLSearchParams(search);
  const issueId = params.get('issueId');
  const rawTab = params.get('tab');
  const tab: SuperAssistantTab =
    rawTab === 'issues' ||
    rawTab === 'skills' ||
    rawTab === 'runtimes' ||
    rawTab === 'settings' ||
    rawTab === 'overview'
      ? rawTab
      : 'overview';
  return {
    issueId,
    tab,
  };
}

const SuperAssistantPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { hasJoinedEnterprise, tenantLabel, showEnterpriseAdminNav } = useEditionFeatures();
  const enterpriseMode = useWebuiEnterpriseMode();
  const [issueAssignments, setIssueAssignments] = useState<SuperAssistantIssueAssignmentMap>({});
  const [issueAssignmentTaskIds, setIssueAssignmentTaskIds] = useState<Record<string, string>>({});
  const isAdmin = isEnterpriseAdminRole(user?.role);
  const superAssistantData = useSuperAssistantData(hasJoinedEnterprise, isAdmin, issueAssignments);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [sharedTaskVisible, setSharedTaskVisible] = useState(false);
  const currentTeam = superAssistantData.primaryTeam
    ? {
        id: superAssistantData.primaryTeam.id,
        name: superAssistantData.primaryTeam.name,
      }
    : null;

  useEffect(() => {
    if (!superAssistantData.featuredIssue) {
      setSelectedIssueId(null);
      return;
    }
    if (!selectedIssueId || !superAssistantData.issueLookup[selectedIssueId]) {
      setSelectedIssueId(superAssistantData.featuredIssue.id);
    }
  }, [selectedIssueId, superAssistantData.featuredIssue, superAssistantData.issueLookup]);

  const currentIssue =
    (selectedIssueId ? superAssistantData.issueLookup[selectedIssueId] : null) ??
    superAssistantData.featuredIssue;
  const currentIssueAssignment = currentIssue ? issueAssignments[currentIssue.id] ?? null : null;
  const currentIssueAssignmentTaskId = currentIssue ? issueAssignmentTaskIds[currentIssue.id] ?? null : null;
  const loadIssueAssignmentsFromTeam = useCallback(async () => {
    if (!superAssistantData.primaryTeam) {
      setIssueAssignments({});
      setIssueAssignmentTaskIds({});
      return;
    }
    const team = superAssistantData.primaryTeam;
    const tasks = await listTeamTasks(team.id);
    const nextAssignments: SuperAssistantIssueAssignmentMap = {};
    const nextTaskIds: Record<string, string> = {};
    tasks.forEach((task) => {
      const metadata = parseIssueTaskMetadata(task);
      if (!metadata) {
        return;
      }
      const slotId = task.owner || metadata.slotId;
      const agentName =
        metadata.agentName ||
        team.agents.find((agent) => agent.slotId === slotId)?.agentName ||
        slotId;
      nextAssignments[metadata.issueId] = {
        issueId: metadata.issueId,
        issueSubject: metadata.issueSubject,
        teamId: team.id,
        teamName: team.name,
        slotId,
        agentName,
        assignedAt: task.updated_at ?? task.created_at,
        manualStatus: metadata.manualStatus,
        manualBlockerMessage: metadata.manualBlockerMessage ?? null,
      };
      nextTaskIds[metadata.issueId] = task.id;
    });
    setIssueAssignments(nextAssignments);
    setIssueAssignmentTaskIds(nextTaskIds);
  }, [superAssistantData.primaryTeam]);

  useEffect(() => {
    void loadIssueAssignmentsFromTeam().catch(() => {
      setIssueAssignments({});
      setIssueAssignmentTaskIds({});
    });
  }, [loadIssueAssignmentsFromTeam]);

  const buildIssueTaskMetadata = useCallback(
    (
      slotId: string,
      agentName: string,
      options?: {
        manualStatus?: SuperAssistantIssueAssignmentMap[string]['manualStatus'];
        manualBlockerMessage?: string | null;
      }
    ): SuperAssistantIssueTaskMetadata | null => {
      if (!currentIssue) {
        return null;
      }
      return {
        source: 'super-assistant-issue',
        issueId: currentIssue.id,
        issueSubject: currentIssue.subject,
        slotId,
        agentName,
        manualStatus: options?.manualStatus,
        manualBlockerMessage: options?.manualBlockerMessage ?? null,
      };
    },
    [currentIssue]
  );
  const currentIssueActivityFeedback = useMemo(() => {
    if (!currentIssueAssignment) {
      return {
        assignedAgentName: null,
        assignedStatus: null,
        blockerMessage: null,
      } as const;
    }
    const matchedAgent =
      superAssistantData.agentExecutionGroups
        .find((group) => group.teamId === currentIssueAssignment.teamId)
        ?.agents.find((agent) => agent.slotId === currentIssueAssignment.slotId) ?? null;
    return {
      assignedAgentName: currentIssueAssignment.agentName,
      assignedStatus: currentIssueAssignment.manualStatus ?? matchedAgent?.status ?? null,
      blockerMessage: currentIssueAssignment.manualBlockerMessage ?? matchedAgent?.blockerMessage ?? null,
    } as const;
  }, [currentIssueAssignment, superAssistantData.agentExecutionGroups]);
  const issueBoardFeedbackById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(issueAssignments).map(([issueId, assignment]) => {
        const matchedAgent =
          superAssistantData.agentExecutionGroups
            .find((group) => group.teamId === assignment.teamId)
            ?.agents.find((agent) => agent.slotId === assignment.slotId) ?? null;
        return [
          issueId,
          {
            assignedAgentName: assignment.agentName,
            assignedStatus: assignment.manualStatus ?? matchedAgent?.status ?? null,
            blockerMessage: assignment.manualBlockerMessage ?? matchedAgent?.blockerMessage ?? null,
          },
        ];
      })
    ) as Record<
      string,
      {
        assignedAgentName: string | null;
        assignedStatus: 'pending' | 'idle' | 'active' | 'completed' | 'failed' | null;
        blockerMessage: string | null;
      }
    >;
  }, [issueAssignments, superAssistantData.agentExecutionGroups]);
  const collaborationContext = useMemo(
    () =>
      pickEnterpriseCollaborationContext({
        ragDocumentCount: superAssistantData.ragDocumentCount,
        skillCount: superAssistantData.skillCount,
        skillNames: superAssistantData.skillNames,
        enabledMcpCount: superAssistantData.enabledMcpCount,
        mcpNames: superAssistantData.mcpNames,
      }),
    [
      superAssistantData.enabledMcpCount,
      superAssistantData.mcpNames,
      superAssistantData.ragDocumentCount,
      superAssistantData.skillCount,
      superAssistantData.skillNames,
    ]
  );
  const assignableAgents = useMemo(
    () =>
      (superAssistantData.primaryTeam?.agents ?? []).map((agent) => ({
        slotId: agent.slotId,
        agentName: agent.agentName,
      })),
    [superAssistantData.primaryTeam]
  );
  const primaryLeadAgent = useMemo(() => {
    const team = superAssistantData.primaryTeam;
    if (!team) {
      return null;
    }
    return team.agents.find((agent) => agent.slotId === team.leadAgentId) ?? team.agents[0] ?? null;
  }, [superAssistantData.primaryTeam]);
  const autopilotDefaults = useMemo(
    () =>
      buildSuperAssistantAutopilotDefaults({
        teamId: superAssistantData.primaryTeam?.id,
        leadAgent: primaryLeadAgent,
        requirementId: currentIssue?.id,
        skillNames: superAssistantData.skillNames,
        mentionUserIds: superAssistantData.openAssigneeUserIds,
        postBackToIssue: Boolean(currentIssue?.id),
      }),
    [
      currentIssue?.id,
      primaryLeadAgent,
      superAssistantData.openAssigneeUserIds,
      superAssistantData.primaryTeam?.id,
      superAssistantData.skillNames,
    ]
  );
  const routedState = useMemo(() => parseSuperAssistantSearch(location.search), [location.search]);
  const currentTab = routedState.tab;

  useEffect(() => {
    if (routedState.issueId && superAssistantData.issueLookup[routedState.issueId]) {
      setSelectedIssueId(routedState.issueId);
    }
  }, [routedState.issueId, superAssistantData.issueLookup]);

  const ensureTeamSession = useCallback(
    async (teamId: string, fallbackMessage: string) => {
      try {
        await ipcBridge.team.ensureSession.invoke({ teamId });
        return true;
      } catch (error) {
        Message.error(getEnterpriseActionError(error, fallbackMessage));
        return false;
      }
    },
    []
  );

  const handleBreakdownIssue = () => navigate(buildKanbanPath(currentIssue, currentTeam));
  const handleSwitchTab = useCallback(
    (tab: SuperAssistantTab) => {
      const params = new URLSearchParams(location.search);
      params.set('tab', tab);
      if (currentIssue?.id) {
        params.set('issueId', currentIssue.id);
      }
      navigate(`/super-assistant?${params.toString()}`);
    },
    [currentIssue?.id, location.search, navigate]
  );
  const handleOpenTeamFlow = async () => {
    if (!superAssistantData.primaryTeam) {
      navigate('/enterprise/teams');
      return;
    }
    const ready = await ensureTeamSession(
      superAssistantData.primaryTeam.id,
      t('common.superAssistant.ensureTeamSessionFailed', { defaultValue: '启动团队执行流失败' })
    );
    if (!ready) {
      return;
    }
    navigate(buildTeamPath(superAssistantData.primaryTeam.id, currentIssue, currentIssueAssignment?.slotId));
  };
  const handleOpenSharedTasks = () => setSharedTaskVisible(true);
  const handleOpenSharedSessions = async () => {
    if (superAssistantData.primaryTeam) {
      const ready = await ensureTeamSession(
        superAssistantData.primaryTeam.id,
        t('common.superAssistant.ensureSharedSessionFailed', { defaultValue: '启动共享会话失败' })
      );
      if (!ready) {
        return;
      }
      navigate(
        buildTeamScopedPath(
          '/sessions',
          superAssistantData.primaryTeam.id,
          superAssistantData.primaryTeam.name,
          currentIssue
        )
      );
      return;
    }
    navigate(buildTeamScopedPath('/sessions', undefined, undefined, currentIssue));
  };
  const handleOpenEnterpriseKnowledge = () => navigate(showEnterpriseAdminNav ? '/enterprise/rag' : '/skills');
  const handleOpenEnterpriseModule = useCallback(() => {
    if (!showEnterpriseAdminNav) {
      void navigate('/enterprise');
      return;
    }
    void openAdminConsole({
      navigate: (path) => {
        void navigate(path);
      },
      openEnterpriseAdminInBrowser: enterpriseMode.openEnterpriseAdminInBrowser,
    });
  }, [enterpriseMode.openEnterpriseAdminInBrowser, navigate, showEnterpriseAdminNav]);
  const handleOpenEnterpriseDelivery = async () => {
    if (currentIssue?.id) {
      navigate(`/issues/${encodeURIComponent(currentIssue.id)}`);
      return;
    }
    navigate('/issues');
  };
  const handleOpenSkillsHub = () => navigate('/skills');
  const handleOpenMcp = () => navigate('/mcp');
  const handleOpenAgentSettings = () => navigate('/settings/agent');
  const handleAssignIssue = async (
    slotId: string,
    agentName: string,
    options?: { navigateAfter?: boolean }
  ) => {
    if (!currentIssue || !superAssistantData.primaryTeam) {
      return;
    }
    const metadata = buildIssueTaskMetadata(slotId, agentName);
    if (!metadata) {
      return;
    }
    try {
      if (currentIssueAssignmentTaskId) {
        await updateTeamTask(currentIssueAssignmentTaskId, {
          owner: slotId,
          status: 'in_progress',
          metadata,
        });
      } else {
        await createTeamTask({
          teamId: superAssistantData.primaryTeam.id,
          subject: currentIssue.subject,
          description: currentIssue.description ?? null,
          owner: slotId,
          metadata,
        });
      }

      const ready = await ensureTeamSession(
        superAssistantData.primaryTeam.id,
        t('common.superAssistant.ensureAssignedAgentFailed', { defaultValue: '启动 Agent 协作会话失败' })
      );
      if (!ready) {
        return;
      }

      await ipcBridge.team.sendMessageToAgent.invoke({
        teamId: superAssistantData.primaryTeam.id,
        slotId,
        content: buildIssueAssignmentPrompt(currentIssue, agentName),
      });

      if (options?.navigateAfter !== false) {
        navigate(buildTeamPath(superAssistantData.primaryTeam.id, currentIssue, slotId));
      }
      await loadIssueAssignmentsFromTeam();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('common.superAssistant.assignIssueFailed', { defaultValue: '同步 Issue 分配失败' })
        )
      );
    }
  };
  const handleMarkIssueBlocked = async () => {
    if (!currentIssue || !currentIssueAssignment || !currentIssueAssignmentTaskId) {
      return;
    }
    const metadata = buildIssueTaskMetadata(currentIssueAssignment.slotId, currentIssueAssignment.agentName, {
      manualStatus: 'failed',
      manualBlockerMessage: '等待人工处理',
    });
    if (!metadata) {
      return;
    }
    try {
      await updateTeamTask(currentIssueAssignmentTaskId, {
        metadata,
      });
      await loadIssueAssignmentsFromTeam();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('common.superAssistant.updateIssueStatusFailed', { defaultValue: '同步 Issue 状态失败' })
        )
      );
    }
  };
  const handleClearIssueBlocked = async () => {
    if (!currentIssue || !currentIssueAssignment || !currentIssueAssignmentTaskId) {
      return;
    }
    const metadata = buildIssueTaskMetadata(currentIssueAssignment.slotId, currentIssueAssignment.agentName, {
      manualStatus: 'idle',
      manualBlockerMessage: null,
    });
    if (!metadata) {
      return;
    }
    try {
      await updateTeamTask(currentIssueAssignmentTaskId, {
        metadata,
      });
      await loadIssueAssignmentsFromTeam();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('common.superAssistant.updateIssueStatusFailed', { defaultValue: '同步 Issue 状态失败' })
        )
      );
    }
  };
  const handleUnassignIssue = async () => {
    if (!currentIssue || !currentIssueAssignment || !currentIssueAssignmentTaskId) {
      return;
    }
    try {
      await deleteTeamTask(currentIssueAssignmentTaskId);
      await loadIssueAssignmentsFromTeam();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('common.superAssistant.assignIssueFailed', { defaultValue: '同步 Issue 分配失败' })
        )
      );
    }
  };
  const handleMoveIssueToReview = async () => {
    if (!currentIssue) {
      return;
    }
    try {
      await updateRequirement(currentIssue.id, { status: 'testing' });
      if (currentIssueAssignment && currentIssueAssignmentTaskId) {
        const metadata = buildIssueTaskMetadata(currentIssueAssignment.slotId, currentIssueAssignment.agentName, {
          manualStatus: undefined,
          manualBlockerMessage: null,
        });
        if (metadata) {
          await updateTeamTask(currentIssueAssignmentTaskId, {
            metadata,
          });
        }
      }
      await superAssistantData.refresh();
      await loadIssueAssignmentsFromTeam();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('common.superAssistant.updateIssueStatusFailed', { defaultValue: '同步 Issue 状态失败' })
        )
      );
    }
  };
  const handleMarkIssueDone = async () => {
    if (!currentIssue) {
      return;
    }
    try {
      await updateRequirement(currentIssue.id, { status: 'completed' });
      if (currentIssueAssignment && currentIssueAssignmentTaskId) {
        const metadata = buildIssueTaskMetadata(currentIssueAssignment.slotId, currentIssueAssignment.agentName, {
          manualStatus: undefined,
          manualBlockerMessage: null,
        });
        if (metadata) {
          await updateTeamTask(currentIssueAssignmentTaskId, {
            status: 'completed',
            metadata,
          });
        }
      }
      await superAssistantData.refresh();
      await loadIssueAssignmentsFromTeam();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('common.superAssistant.updateIssueStatusFailed', { defaultValue: '同步 Issue 状态失败' })
        )
      );
    }
  };
  const handleOpenAssignedAgent = async () => {
    if (!currentIssue || !currentIssueAssignment) {
      return;
    }
    const ready = await ensureTeamSession(
      currentIssueAssignment.teamId,
      t('common.superAssistant.ensureAssignedAgentFailed', { defaultValue: '启动 Agent 协作会话失败' })
    );
    if (!ready) {
      return;
    }
    navigate(buildTeamPath(currentIssueAssignment.teamId, currentIssue, currentIssueAssignment.slotId));
  };

  const handleStartCurrentIssue = async () => {
    if (!currentIssue) {
      navigate('/issues');
      return;
    }
    if (currentIssueAssignment) {
      await handleOpenAssignedAgent();
      return;
    }
    if (primaryLeadAgent) {
      await handleAssignIssue(primaryLeadAgent.slotId, primaryLeadAgent.agentName, { navigateAfter: false });
      handleSwitchTab('runtimes');
      return;
    }
    await handleOpenTeamFlow();
  };

  const handleOpenCurrentIssueDetail = () => {
    if (!currentIssue?.id) {
      navigate('/issues');
      return;
    }
    navigate(`/issues/${encodeURIComponent(currentIssue.id)}`);
  };

  const workspaceIssueList = useMemo(
    () =>
      superAssistantData.boardColumns
        .flatMap((column) => column.items)
        .toSorted((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent')),
    [superAssistantData.boardColumns]
  );

  if (!hasJoinedEnterprise) {
    return (
      <Result
        status='403'
        title={t('common.superAssistant.joinRequiredTitle', { defaultValue: '加入企业后可使用超级助手' })}
        subTitle={t('common.superAssistant.joinRequiredDesc', {
          defaultValue: '超级助手会复用团队协作、共享任务与企业能力入口，请先加入企业组织。',
        })}
        extra={
          <Button type='primary' onClick={() => navigate('/sessions')}>
            {t('common.superAssistant.backToWorkspace', { defaultValue: '返回主工作台' })}
          </Button>
        }
      />
    );
  }

  return (
    <div className='h-full overflow-auto px-20px py-16px'>
      <SuperAssistantHeader
        tenantLabel={tenantLabel}
        isAdmin={isAdmin}
        openIssueCount={superAssistantData.openIssueCount}
        activeAgentCount={superAssistantData.activeAgentCount}
        skillCount={superAssistantData.skillCount}
        onStartCurrentIssue={() => void handleStartCurrentIssue()}
        onOpenRecentRun={() => handleSwitchTab('runtimes')}
        onOpenIssues={() => navigate('/issues')}
      />
      <div className='space-y-12px'>
        <Card>
          <div className='flex items-center gap-8px flex-wrap'>
            {([
              ['overview', t('common.superAssistant.tabs.workbench', { defaultValue: '工作台' })],
              ['issues', t('common.superAssistant.tabs.dispatch', { defaultValue: '调度视图' })],
              ['skills', t('common.superAssistant.tabs.skills', { defaultValue: 'Skills' })],
              ['runtimes', t('common.superAssistant.tabs.runtimes', { defaultValue: '运行时' })],
              ['settings', t('common.superAssistant.tabs.settings', { defaultValue: '设置' })],
            ] as const).map(([tab, label]) => (
              <Button
                key={tab}
                size='small'
                type={currentTab === tab ? 'primary' : 'outline'}
                onClick={() => handleSwitchTab(tab)}
              >
                {label}
              </Button>
            ))}
          </div>
        </Card>
        {currentTab === 'overview' ? (
          <>
            <div className='grid gap-12px xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'>
              <Card title={t('common.superAssistant.workbenchTitle', { defaultValue: '当前 Issue 工作台' })}>
                {currentIssue ? (
                  <div className='space-y-12px'>
                    <div>
                      <div className='text-16px font-700 text-t-primary'>{currentIssue.subject}</div>
                      {currentIssue.description ? (
                        <div className='mt-6px text-12px text-t-tertiary'>{currentIssue.description}</div>
                      ) : null}
                    </div>
                    <div className='flex items-center gap-8px flex-wrap'>
                      <Tag color='arcoblue'>{currentIssue.status}</Tag>
                      <Tag color='orange'>{currentIssue.priority}</Tag>
                      {currentIssueAssignment?.agentName ? (
                        <Tag color='green'>
                          {t('common.superAssistant.assignedAgentHint', {
                            defaultValue: '当前负责：{{agent}}',
                            agent: currentIssueAssignment.agentName,
                          })}
                        </Tag>
                      ) : (
                        <Tag color='gray'>
                          {t('common.superAssistant.unassigned', { defaultValue: '未分配' })}
                        </Tag>
                      )}
                    </div>
                    <div className='flex items-center gap-8px flex-wrap'>
                      <Button type='primary' size='small' onClick={() => void handleStartCurrentIssue()}>
                        {t('common.superAssistant.headerStartWork', { defaultValue: '开始处理当前 Issue' })}
                      </Button>
                      <Button size='small' type='outline' onClick={handleOpenCurrentIssueDetail}>
                        {t('common.superAssistant.openIssueDetail', { defaultValue: '打开 Issue 详情' })}
                      </Button>
                      <Button size='small' onClick={handleBreakdownIssue}>
                        {t('common.superAssistant.breakdownIssue', { defaultValue: '拆解当前 Issue' })}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Empty
                    description={t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' })}
                  />
                )}
              </Card>
              <Card title={t('common.superAssistant.recentRunTitle', { defaultValue: '最近运行 / 执行反馈' })}>
                {currentIssue ? (
                  <div className='space-y-10px text-13px text-t-secondary'>
                    <div>
                      {t('common.superAssistant.currentIssueLabel', {
                        defaultValue: '当前处理：{{subject}}',
                        subject: currentIssue.subject,
                      })}
                    </div>
                    <div>
                      {t('common.superAssistant.recentRunAgent', {
                        defaultValue: '执行 Agent：{{agent}}',
                        agent: currentIssueActivityFeedback.assignedAgentName ?? '—',
                      })}
                    </div>
                    <div>
                      {t('common.superAssistant.recentRunStatus', {
                        defaultValue: '当前状态：{{status}}',
                        status: currentIssueActivityFeedback.assignedStatus ?? 'idle',
                      })}
                    </div>
                    {currentIssueActivityFeedback.blockerMessage ? (
                      <div className='text-12px text-red-500'>{currentIssueActivityFeedback.blockerMessage}</div>
                    ) : null}
                    <div className='flex items-center gap-8px flex-wrap pt-4px'>
                      <Button size='small' type='outline' onClick={() => handleSwitchTab('runtimes')}>
                        {t('common.superAssistant.headerRecentRun', { defaultValue: '查看最近运行' })}
                      </Button>
                      {currentIssueAssignment ? (
                        <Button size='small' onClick={() => void handleOpenAssignedAgent()}>
                          {t('common.superAssistant.openAssignedAgent', { defaultValue: '继续该 Agent 会话' })}
                        </Button>
                      ) : (
                        <Button size='small' onClick={() => handleSwitchTab('issues')}>
                          {t('common.superAssistant.goToDispatch', { defaultValue: '进入调度视图' })}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Empty
                    description={t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' })}
                  />
                )}
              </Card>
            </div>
            <Card title={t('common.superAssistant.issueQueueTitle', { defaultValue: 'Issue 队列' })}>
              {workspaceIssueList.length ? (
                <div className='grid gap-10px md:grid-cols-2 xl:grid-cols-3'>
                  {workspaceIssueList.slice(0, 6).map((issue) => (
                    <div
                      key={issue.id}
                      className='cursor-pointer rd-10px border border-solid border-[var(--color-border-2)] p-12px transition-all hover:border-primary hover:bg-[var(--color-fill-2)]'
                      onClick={() => {
                        setSelectedIssueId(issue.id);
                        handleSwitchTab('overview');
                      }}
                    >
                      <div className='text-13px font-600 text-t-primary'>{issue.subject}</div>
                      {issue.description ? (
                        <div className='mt-6px text-12px text-t-tertiary line-clamp-2'>{issue.description}</div>
                      ) : null}
                      <div className='mt-8px flex items-center gap-6px flex-wrap'>
                        <Tag size='small' color='arcoblue'>
                          {issue.status}
                        </Tag>
                        <Tag size='small' color='orange'>
                          {issue.priority}
                        </Tag>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty description={t('common.superAssistant.noIssues', { defaultValue: '暂无共享 Issue' })} />
              )}
            </Card>
          </>
        ) : null}
        {currentTab === 'issues' ? (
          <IssuesWorkbench
            isAdmin={isAdmin}
            loading={superAssistantData.loading}
            boardColumns={superAssistantData.boardColumns}
            issueBoardFeedbackById={issueBoardFeedbackById}
            currentIssue={currentIssue}
            assignableAgents={assignableAgents}
            currentAssignmentAgentName={currentIssueAssignment?.agentName ?? null}
            currentIssueActivityFeedback={currentIssueActivityFeedback}
            onSelectIssue={setSelectedIssueId}
            onBreakdownIssue={handleBreakdownIssue}
            onAssignIssue={handleAssignIssue}
            onMarkIssueBlocked={handleMarkIssueBlocked}
            onClearIssueBlocked={handleClearIssueBlocked}
            onUnassignIssue={handleUnassignIssue}
            onMoveIssueToReview={handleMoveIssueToReview}
            onMarkIssueDone={handleMarkIssueDone}
            onOpenAssignedAgent={handleOpenAssignedAgent}
            onOpenKanban={handleBreakdownIssue}
            onOpenTeamFlow={handleOpenTeamFlow}
            onOpenSharedTasks={handleOpenSharedTasks}
            onOpenSharedSessions={handleOpenSharedSessions}
            onOpenEnterpriseModule={handleOpenEnterpriseModule}
            onOpenEnterpriseKnowledge={handleOpenEnterpriseKnowledge}
            onOpenSkills={handleOpenSkillsHub}
            onOpenMcp={handleOpenMcp}
            collaborationContext={collaborationContext}
            autopilotDefaults={autopilotDefaults}
          />
        ) : null}
        {currentTab === 'skills' ? (
          <Card title={t('common.superAssistant.rebuild.compoundTitle', { defaultValue: '能力沉淀与运行时' })}>
            <div className='mb-10px text-12px text-t-tertiary'>
              {t('common.superAssistant.rebuild.compoundDesc', {
                defaultValue: '把稳定流程沉淀成 Skills，把外部连接沉淀成 MCP，再复用到新的 Issue 处理中。',
              })}
            </div>
            <div className='grid gap-12px xl:grid-cols-2'>
              <SkillsTab
                skillCount={superAssistantData.skillCount}
                skillNames={superAssistantData.skillNames}
                enabledMcpCount={superAssistantData.enabledMcpCount}
                mcpNames={superAssistantData.mcpNames}
                onOpenSkillsHub={handleOpenSkillsHub}
                onOpenMcp={handleOpenMcp}
              />
              <RuntimesTab
                totalAgentCount={superAssistantData.totalAgentCount}
                activeAgentCount={superAssistantData.activeAgentCount}
                enabledMcpCount={superAssistantData.enabledMcpCount}
                onOpenAgentSettings={handleOpenAgentSettings}
                onOpenModelSettings={() => navigate('/settings/model')}
              />
            </div>
          </Card>
        ) : null}
        {currentTab === 'runtimes' ? (
          <Card title={t('common.superAssistant.rebuild.liveExecutionTitle', { defaultValue: '实时执行面板' })}>
            <div className='mb-10px text-12px text-t-tertiary'>
              {t('common.superAssistant.rebuild.liveExecutionDesc', {
                defaultValue: '这里聚合运行中的 Agent、执行状态和阻塞信号，便于从产品视角查看最近运行。',
              })}
            </div>
            <AgentsTab executionGroups={superAssistantData.agentExecutionGroups} />
          </Card>
        ) : null}
        {currentTab === 'settings' ? (
          <Card title={t('common.superAssistant.rebuild.systemConfigTitle', { defaultValue: '系统配置入口' })}>
            <SettingsTab
              isAdmin={isAdmin}
              onOpenEnterpriseConsole={() => navigate('/enterprise')}
              onOpenWebuiSettings={() => navigate('/settings/webui')}
            />
          </Card>
        ) : null}
      </div>
      <CreateSharedTaskModal
        visible={sharedTaskVisible}
        onClose={() => setSharedTaskVisible(false)}
        issueSubject={currentIssue?.subject ?? ''}
        issueDescription={currentIssue?.description ?? null}
        assignableAgents={assignableAgents}
        onCreateWithAgent={
          currentIssue
            ? async (slotId, agentName) => {
                await handleAssignIssue(slotId, agentName, { navigateAfter: false });
              }
            : undefined
        }
      />
    </div>
  );
};

export default SuperAssistantPage;
