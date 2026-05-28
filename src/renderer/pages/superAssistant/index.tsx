import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Message, Result } from '@arco-design/web-react';
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
} {
  const params = new URLSearchParams(search);
  const issueId = params.get('issueId');
  return {
    issueId,
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
  const handleOpenEnterpriseKnowledge = () => navigate(showEnterpriseAdminNav ? '/enterprise/rag' : '/super-assistant?tab=skills');
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
    if (showEnterpriseAdminNav) {
      navigate('/enterprise/cteam');
      return;
    }
    await handleOpenTeamFlow();
  };
  const handleOpenSkillsHub = () => navigate('/settings/skills-hub');
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
        onOpenKanban={handleBreakdownIssue}
        onOpenTeamFlow={handleOpenTeamFlow}
        onCreateSharedTask={handleOpenSharedTasks}
      />
      <div className='space-y-12px'>
        <Card title={t('common.superAssistant.rebuild.commandCenterTitle', { defaultValue: '任务指挥中心' })}>
          <div className='text-12px text-t-tertiary'>
            {t('common.superAssistant.rebuild.commandCenterDesc', {
              defaultValue:
                '一个页面完成“分配任务 -> 观察进度 -> 处理阻塞 -> 标记完成”。无需在多个标签页之间来回切换。',
            })}
          </div>
        </Card>
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
        <Card title={t('common.superAssistant.rebuild.liveExecutionTitle', { defaultValue: '实时执行面板' })}>
          <div className='mb-10px text-12px text-t-tertiary'>
            {t('common.superAssistant.rebuild.liveExecutionDesc', {
              defaultValue: '智能体状态、人类操作、阻塞信息在同一时间线展示，便于快速决策。',
            })}
          </div>
          <AgentsTab executionGroups={superAssistantData.agentExecutionGroups} />
        </Card>
        <Card title={t('common.superAssistant.rebuild.compoundTitle', { defaultValue: '能力沉淀与运行时' })}>
          <div className='mb-10px text-12px text-t-tertiary'>
            {t('common.superAssistant.rebuild.compoundDesc', {
              defaultValue: '每次任务结果都应沉淀为技能；运行时与模型配置决定可持续执行能力。',
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
        <Card title={t('common.superAssistant.rebuild.systemConfigTitle', { defaultValue: '系统配置入口' })}>
          <SettingsTab
            isAdmin={isAdmin}
            onOpenEnterpriseConsole={() => navigate('/enterprise')}
            onOpenWebuiSettings={() => navigate('/settings/webui')}
          />
        </Card>
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
