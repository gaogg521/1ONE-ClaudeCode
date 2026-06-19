import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Message, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TTeam } from '@/common/types/teamTypes';
import { DESKTOP_OPERATOR_USER_ID, isEnterpriseAdminRole } from '@/common/auth/enterpriseRoles';
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
import AgentsTab, { type AgentCardRef } from './components/AgentsTab';
import DigitalEmployeeDetailModal, {
  type DigitalEmployeeDetailTarget,
} from './components/DigitalEmployeeDetailModal';
import CreateWorkspaceAgentModal from './components/CreateWorkspaceAgentModal';
import ManageWorkspaceAgentModal, { type ManagedAgentRef } from './components/ManageWorkspaceAgentModal';
import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';
import { useAssistantCollaborationTeams } from './hooks/useAssistantCollaborationTeams';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import {
  deletePersonalDigitalEmployee,
  deleteTeamDigitalEmployee,
} from './utils/deleteDigitalEmployee';
import {
  agentFromKey,
  resolveConversationType,
  resolveTeamAgentType,
} from '@/renderer/pages/team/components/agentSelectUtils';
import SkillsTab from './components/SkillsTab';
import RuntimesTab from './components/RuntimesTab';
import SettingsTab from './components/SettingsTab';
import type { SuperAssistantIssueAssignmentMap } from './hooks/useSuperAssistantData';
import { pickEnterpriseCollaborationContext } from './hooks/useEnterpriseCollaborationContext';
import { useSuperAssistantData } from './hooks/useSuperAssistantData';
import type { SuperAssistantAutopilotDefaults } from './utils/autopilotDefaults';
import {
  buildAutopilotForPersonalAgent,
  buildIssueAssignmentPrompt,
  buildPersonalDigitalEmployeeCronPrompt,
  buildSuperAssistantAutopilotDefaults,
} from './utils/autopilotDefaults';
import type { TeamAgent } from '@/common/types/teamTypes';
import { buildIssuePlanningPath } from '@/renderer/pages/issues/issueCollaborationRouting';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { SuperAssistantAgentExecutionGroup } from './hooks/useSuperAssistantData';
import { normalizeStoredSkillIds } from '@/renderer/hooks/skills/useBindableSkillOptions';
import {
  buildSuperAssistantPath,
  parseSuperAssistantTab,
  readStoredSuperAssistantTab,
  readSuperAssistantSearch,
  shouldRedirectLegacyRuntimesTab,
  storeSuperAssistantTab,
  AGENT_FLEET_PATH,
  type SuperAssistantTab,
} from './superAssistantTabRouting';

function buildManagedTeamAgentFromRef(ref: AgentCardRef): TeamAgent {
  return {
    slotId: ref.slotId,
    conversationId: '',
    role: 'teammate',
    agentType: ref.agentType,
    agentName: ref.agentName,
    conversationType: ref.agentType,
    status: 'idle',
  };
}

function resolveManagedAgent(
  teams: TTeam[],
  _executionGroups: SuperAssistantAgentExecutionGroup[],
  ref: AgentCardRef
): ManagedAgentRef | null {
  if (ref.teamId === 'personal') {
    return {
      scope: 'personal',
      teamId: 'personal',
      tenantId: 'default',
      teamName: ref.teamName,
      slotId: ref.slotId,
      agentName: ref.agentName,
      agentType: ref.agentType,
      teamAgent: buildManagedTeamAgentFromRef(ref),
    };
  }
  const team = teams.find((item) => item.id === ref.teamId);
  const teamAgent = team?.agents.find((agent) => agent.slotId === ref.slotId);
  if (!teamAgent) {
    return null;
  }
  return {
    scope: 'team',
    teamId: ref.teamId,
    tenantId: team?.tenantId ?? 'default',
    teamName: team?.name ?? ref.teamName,
    slotId: ref.slotId,
    agentName: ref.agentName,
    agentType: ref.agentType,
    teamAgent,
  };
}

type NavigationIssueContext = {
  id: string;
  subject: string;
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

function areIssueAssignmentsEqual(
  a: SuperAssistantIssueAssignmentMap,
  b: SuperAssistantIssueAssignmentMap
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      right &&
      left.issueId === right.issueId &&
      left.issueSubject === right.issueSubject &&
      left.teamId === right.teamId &&
      left.teamName === right.teamName &&
      left.slotId === right.slotId &&
      left.agentName === right.agentName &&
      left.assignedAt === right.assignedAt &&
      left.manualStatus === right.manualStatus &&
      left.manualBlockerMessage === right.manualBlockerMessage
    );
  });
}

function areIssueTaskIdMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
}

function resolvePrimaryPersonalAgentRef(
  groups: SuperAssistantAgentExecutionGroup[]
): AgentCardRef | null {
  const personalGroup = groups.find((group) => group.teamId === 'personal');
  const agent = personalGroup?.agents[0];
  if (!personalGroup || !agent) {
    return null;
  }
  return {
    teamId: personalGroup.teamId,
    teamName: personalGroup.teamName,
    slotId: agent.slotId,
    agentName: agent.agentName,
    agentType: agent.agentType,
  };
}

function appendIssueContext(params: URLSearchParams, issue: NavigationIssueContext): void {
  if (!issue) {
    return;
  }
  params.set('issueId', issue.id);
  params.set('issueSubject', issue.subject);
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

const SuperAssistantPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showTeamsFeature, tenantLabel, showEnterpriseAdminNav } = useEditionFeatures();
  const enterpriseMode = useWebuiEnterpriseMode();
  const [issueAssignments, setIssueAssignments] = useState<SuperAssistantIssueAssignmentMap>({});
  const [issueAssignmentTaskIds, setIssueAssignmentTaskIds] = useState<Record<string, string>>({});
  const isAdmin = isEnterpriseAdminRole(user?.role);
  const superAssistantData = useSuperAssistantData(true, isAdmin, issueAssignments);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [sharedTaskVisible, setSharedTaskVisible] = useState(false);
  const [createDigitalEmployeeVisible, setCreateDigitalEmployeeVisible] = useState(false);
  const [digitalEmployeeDetailTarget, setDigitalEmployeeDetailTarget] =
    useState<DigitalEmployeeDetailTarget | null>(null);
  const [agentAutomationVisible, setAgentAutomationVisible] = useState(false);
  const [automationAgent, setAutomationAgent] = useState<ManagedAgentRef | null>(null);
  const [agentAutopilotDefaults, setAgentAutopilotDefaults] = useState<SuperAssistantAutopilotDefaults | null>(
    null
  );
  const [automationInitialPrompt, setAutomationInitialPrompt] = useState<string | undefined>(undefined);
  const [editingCronJob, setEditingCronJob] = useState<ICronJob | undefined>(undefined);
  const [managingAgent, setManagingAgent] = useState<ManagedAgentRef | null>(null);
  const {
    teams,
    canUseWorkspaceVisibility,
    hasCollaborationTeam,
    refresh: refreshCollaborationTeams,
    hydrateTeam,
  } = useAssistantCollaborationTeams();
  const { cliAgents, presetAssistants } = useConversationAgents();
  const locationSearch = useMemo(() => readSuperAssistantSearch(location), [location.search]);
  const routedState = useMemo(() => {
    const params = new URLSearchParams(locationSearch);
    return {
      issueId: params.get('issueId'),
      tab: parseSuperAssistantTab(locationSearch),
      autoStart: params.get('action') === 'start',
    };
  }, [locationSearch]);
  const autoStartIssueRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<SuperAssistantTab>(() => {
    const initialSearch = readSuperAssistantSearch(location);
    const fromUrl = parseSuperAssistantTab(initialSearch);
    if (initialSearch.includes('tab=')) {
      return fromUrl;
    }
    return readStoredSuperAssistantTab() ?? fromUrl;
  });
  const lastExternalSearchRef = useRef(locationSearch);

  useEffect(() => {
    if (lastExternalSearchRef.current === locationSearch) {
      return;
    }
    lastExternalSearchRef.current = locationSearch;
    const nextTab = parseSuperAssistantTab(locationSearch);
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [locationSearch]);

  const openAgentFleet = useCallback(() => {
    if (isElectronDesktop()) {
      if (typeof window !== 'undefined' && window.location.hash !== `#${AGENT_FLEET_PATH}`) {
        window.location.hash = `#${AGENT_FLEET_PATH}`;
      }
      return;
    }
    void navigate(AGENT_FLEET_PATH);
  }, [navigate]);

  useEffect(() => {
    if (!shouldRedirectLegacyRuntimesTab(locationSearch)) {
      return;
    }
    openAgentFleet();
  }, [locationSearch, openAgentFleet]);

  const issueLookup = superAssistantData.issueLookup;
  const featuredIssueId = superAssistantData.featuredIssue?.id ?? null;

  useEffect(() => {
    if (!featuredIssueId) {
      setSelectedIssueId((prev) => (prev === null ? prev : null));
      return;
    }
    setSelectedIssueId((prev) => {
      if (prev && issueLookup[prev]) {
        return prev;
      }
      return prev === featuredIssueId ? prev : featuredIssueId;
    });
  }, [featuredIssueId, issueLookup]);

  const routedIssue =
    routedState.issueId && issueLookup[routedState.issueId]
      ? issueLookup[routedState.issueId]
      : null;
  const currentIssue =
    (selectedIssueId ? issueLookup[selectedIssueId] : null) ??
    routedIssue ??
    superAssistantData.featuredIssue;
  const currentIssueAssignment = currentIssue ? issueAssignments[currentIssue.id] ?? null : null;
  const currentIssueAssignmentTaskId = currentIssue ? issueAssignmentTaskIds[currentIssue.id] ?? null : null;
  const primaryTeamId = superAssistantData.primaryTeam?.id ?? null;
  const teamsVersionKey = useMemo(
    () =>
      teams
        .map((team) => `${team.id}:${team.tenantId ?? ''}:${team.name}:${team.agents.length}`)
        .join('|'),
    [teams]
  );
  const teamLookup = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teamsVersionKey]);

  const loadIssueAssignmentsFromTeam = useCallback(async () => {
    if (!primaryTeamId) {
      setIssueAssignments((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setIssueAssignmentTaskIds((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const team = teamLookup.get(primaryTeamId);
    if (!team) {
      setIssueAssignments((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setIssueAssignmentTaskIds((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
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
    setIssueAssignments((prev) => (areIssueAssignmentsEqual(prev, nextAssignments) ? prev : nextAssignments));
    setIssueAssignmentTaskIds((prev) => (areIssueTaskIdMapsEqual(prev, nextTaskIds) ? prev : nextTaskIds));
  }, [primaryTeamId, teamLookup]);

  useEffect(() => {
    void loadIssueAssignmentsFromTeam().catch(() => {
      setIssueAssignments((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setIssueAssignmentTaskIds((prev) => (Object.keys(prev).length === 0 ? prev : {}));
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
  const [managedSkillIds, setManagedSkillIds] = useState<string[]>([]);

  useEffect(() => {
    if (!managingAgent) {
      setManagedSkillIds([]);
      return;
    }
    if (managingAgent.scope === 'personal') {
      void ipcBridge.personalAgent.get
        .invoke({
          id: managingAgent.slotId,
          ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
        })
        .then((record) => {
          const config = record?.automationConfig as { skillIds?: string[] } | undefined;
          setManagedSkillIds(normalizeStoredSkillIds(config?.skillIds ?? []));
        })
        .catch(() => setManagedSkillIds([]));
      return;
    }
    setManagedSkillIds(normalizeStoredSkillIds(managingAgent.teamAgent.skillIds ?? []));
  }, [managingAgent, user?.id]);

  const handleCreateWorkspaceAgent = useCallback(
    async (payload: {
      teamId: string;
      agentName: string;
      agentKey: string;
      description: string;
      visibility: 'workspace' | 'personal';
      skillIds: string[];
      preferredModelId?: string;
      providerModelKey?: string;
      instructions?: string;
    }): Promise<ManagedAgentRef | null> => {
      const allAgents = [...cliAgents, ...presetAssistants];
      const agent = agentFromKey(payload.agentKey, allAgents);
      const backend = resolveTeamAgentType(agent, 'claude');
      const teamAgent: Omit<TeamAgent, 'slotId'> = {
        conversationId: '',
        role: 'teammate',
        agentType: backend,
        agentName: payload.agentName,
        status: 'pending',
        conversationType: resolveConversationType(backend),
        cliPath: agent?.cliPath,
        customAgentId: agent?.customAgentId,
        skillIds: payload.skillIds,
        preferredModelId: payload.preferredModelId,
        providerModelKey: payload.providerModelKey,
      };
      const automationConfig = {
        ...(payload.skillIds.length > 0 ? { skillIds: payload.skillIds } : {}),
        ...(payload.preferredModelId ? { preferredModelId: payload.preferredModelId } : {}),
        ...(payload.providerModelKey ? { providerModelKey: payload.providerModelKey } : {}),
        ...(payload.instructions ? { instructions: payload.instructions } : {}),
      };

      if (payload.visibility === 'personal') {
        const created = await ipcBridge.personalAgent.create.invoke({
          ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
          tenantId: 'default',
          name: payload.agentName,
          description: payload.description,
          agentType: backend,
          conversationType: resolveConversationType(backend),
          cliPath: agent?.cliPath,
          customAgentId: agent?.customAgentId,
          automationConfig,
        });
        await superAssistantData.refresh();
        return {
          scope: 'personal',
          teamId: 'personal',
          tenantId: 'default',
          teamName: t('common.superAssistant.personalDigitalEmployees', { defaultValue: '个人数字员工' }),
          slotId: created.id,
          agentName: created.name,
          agentType: created.agentType,
          teamAgent: {
            slotId: created.id,
            conversationId: '',
            role: 'teammate',
            agentType: created.agentType,
            agentName: created.name,
            conversationType: created.conversationType,
            status: 'idle',
            cliPath: created.cliPath,
            customAgentId: created.customAgentId,
            skillIds: payload.skillIds,
          },
        };
      }

      if (!payload.teamId) {
        throw new Error(t('common.superAssistant.createAgentTeamRequired', { defaultValue: '请先选择所属团队' }));
      }

      const createdAgent = await ipcBridge.team.addAgent.invoke({
        teamId: payload.teamId,
        tenantId: teams.find((team) => team.id === payload.teamId)?.tenantId,
        agent: teamAgent,
      });
      await refreshCollaborationTeams();
      const team = teams.find((item) => item.id === payload.teamId);
      return {
        scope: 'team',
        teamId: payload.teamId,
        tenantId: team?.tenantId ?? 'default',
        teamName: team?.name ?? payload.teamId,
        slotId: createdAgent.slotId,
        agentName: createdAgent.agentName,
        agentType: createdAgent.agentType,
        teamAgent: createdAgent,
      };
    },
    [cliAgents, refreshCollaborationTeams, presetAssistants, superAssistantData, t, teams, user?.id]
  );

  const handleSaveAgentSkills = useCallback(
    async (managed: ManagedAgentRef, skillIds: string[]) => {
      if (managed.scope === 'personal') {
        const existing = await ipcBridge.personalAgent.get.invoke({
          id: managed.slotId,
          ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
        });
        const automationConfig = {
          ...existing?.automationConfig,
          skillIds,
        };
        await ipcBridge.personalAgent.update.invoke({
          id: managed.slotId,
          ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
          updates: { automationConfig },
        });
        await superAssistantData.refresh();
        return;
      }
      await ipcBridge.team.updateAgentSkillIds.invoke({
        teamId: managed.teamId,
        tenantId: managed.tenantId,
        slotId: managed.slotId,
        skillIds,
      });
      await refreshCollaborationTeams();
    },
    [refreshCollaborationTeams, superAssistantData, user?.id]
  );

  const primaryLeadAgent = useMemo(() => {
    const team = superAssistantData.primaryTeam;
    if (!team) {
      return null;
    }
    return team.agents.find((agent) => agent.slotId === team.leadAgentId) ?? team.agents[0] ?? null;
  }, [superAssistantData.primaryTeam]);
  const buildAutopilotForTeamAgent = useCallback(
    (teamId: string, agent: TeamAgent) =>
      buildSuperAssistantAutopilotDefaults({
        teamId,
        agent,
        requirementId: currentIssue?.id,
        skillNames: superAssistantData.skillNames,
        mentionUserIds: superAssistantData.openAssigneeUserIds,
        postBackToIssue: Boolean(currentIssue?.id),
      }),
    [
      currentIssue?.id,
      superAssistantData.openAssigneeUserIds,
      superAssistantData.skillNames,
    ]
  );

  const autopilotDefaults = useMemo(
    () =>
      primaryLeadAgent && superAssistantData.primaryTeam?.id
        ? buildAutopilotForTeamAgent(superAssistantData.primaryTeam.id, primaryLeadAgent)
        : null,
    [buildAutopilotForTeamAgent, primaryLeadAgent, superAssistantData.primaryTeam?.id]
  );

  const selectedAgentAutopilotDefaults = agentAutopilotDefaults ?? autopilotDefaults;

  const closeAgentAutomationDialog = useCallback(() => {
    setAgentAutomationVisible(false);
    setAutomationAgent(null);
    setAgentAutopilotDefaults(null);
    setAutomationInitialPrompt(undefined);
    setEditingCronJob(undefined);
  }, []);

  const openAgentAutomationDialog = useCallback(
    async (managed: ManagedAgentRef, job?: ICronJob) => {
      setAutomationAgent(managed);
      setEditingCronJob(job);
      try {
        if (managed.scope === 'personal') {
          const record = await ipcBridge.personalAgent.get.invoke({
            id: managed.slotId,
            ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
          });
          if (!record) {
            Message.warning(
              t('common.superAssistant.agentNotFound', { defaultValue: '未找到该智能体' })
            );
            return;
          }
          const defaults = buildAutopilotForPersonalAgent(record, {
            requirementId: currentIssue?.id,
            skillNames: superAssistantData.skillNames,
            mentionUserIds: superAssistantData.openAssigneeUserIds,
            postBackToIssue: Boolean(currentIssue?.id),
          });
          if (!defaults) {
            Message.error(
              t('common.superAssistant.agentAutomationAgentMissing', {
                defaultValue: '无法解析该数字员工的 Agent 类型，请先在编辑中配置 Agent',
              })
            );
            return;
          }
          setAgentAutopilotDefaults(defaults);
          setAutomationInitialPrompt(
            job?.target.payload.text ?? buildPersonalDigitalEmployeeCronPrompt(record, currentIssue)
          );
        } else {
          setAgentAutopilotDefaults(
            buildAutopilotForTeamAgent(managed.teamId, managed.teamAgent) ?? null
          );
          setAutomationInitialPrompt(undefined);
        }
        setAgentAutomationVisible(true);
      } catch (error) {
        Message.error(getEnterpriseActionError(error, t('common.superAssistant.agentScheduleFailed', {
          defaultValue: '打开定时任务失败',
        })));
      }
    },
    [
      buildAutopilotForTeamAgent,
      currentIssue,
      superAssistantData.openAssigneeUserIds,
      superAssistantData.skillNames,
      t,
      user?.id,
    ]
  );

  const handleManageAgent = useCallback(
    (ref: AgentCardRef) => {
      const managed = resolveManagedAgent(teams, superAssistantData.agentExecutionGroups, ref);
      if (!managed) {
        Message.warning(t('common.superAssistant.agentNotFound', { defaultValue: '未找到该智能体' }));
        return;
      }
      setManagingAgent(managed);
    },
    [superAssistantData.agentExecutionGroups, t, teams]
  );

  const handleSaveAgentName = useCallback(
    async (teamId: string, slotId: string, newName: string) => {
      if (teamId === 'personal') {
        await ipcBridge.personalAgent.update.invoke({
          id: slotId,
          ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
          updates: { name: newName },
        });
        await superAssistantData.refresh();
        return;
      }
      const tenantId = teams.find((team) => team.id === teamId)?.tenantId;
      await ipcBridge.team.renameAgent.invoke({ teamId, tenantId, slotId, newName });
      await refreshCollaborationTeams();
    },
    [refreshCollaborationTeams, superAssistantData, teams, user?.id]
  );

  const handleScheduleAgent = useCallback(
    (ref: AgentCardRef) => {
      const managed = resolveManagedAgent(teams, superAssistantData.agentExecutionGroups, ref);
      if (!managed) {
        return;
      }
      void openAgentAutomationDialog(managed);
    },
    [openAgentAutomationDialog, superAssistantData.agentExecutionGroups, teams]
  );

  const buildDigitalEmployeeDetailTarget = useCallback(
    (managed: ManagedAgentRef): DigitalEmployeeDetailTarget => {
      if (managed.scope === 'personal') {
        return {
          scope: 'personal',
          agentId: managed.slotId,
          ownerUserId: user?.id ?? DESKTOP_OPERATOR_USER_ID,
        };
      }
      return {
        scope: 'team',
        teamId: managed.teamId,
        tenantId: managed.tenantId,
        slotId: managed.slotId,
      };
    },
    [user?.id]
  );

  const handleRunAutomationJob = useCallback(
    async (job: ICronJob) => {
      try {
        const autopilot = job.metadata.agentConfig?.autopilotContext;
        const isDigitalEmployeeCron =
          autopilot?.source === 'super_assistant' && Boolean(autopilot.agentSlotId);
        await ipcBridge.cron.runNow.invoke({ jobId: job.id });
        if (isDigitalEmployeeCron) {
          Message.success(
            t('common.superAssistant.digitalEmployee.runStarted', {
              defaultValue: '已在工作区后台开始执行，可在「查看详情」跟踪进度',
            })
          );
          if (autopilot.teamId === 'personal') {
            const agentId = autopilot.personalAgentId ?? autopilot.agentSlotId;
            if (agentId) {
              setDigitalEmployeeDetailTarget({
                scope: 'personal',
                agentId,
                ownerUserId: autopilot.ownerUserId ?? user?.id ?? DESKTOP_OPERATOR_USER_ID,
              });
            }
          } else if (autopilot.teamId) {
            setDigitalEmployeeDetailTarget({
              scope: 'team',
              teamId: autopilot.teamId,
              slotId: autopilot.agentSlotId,
            });
          }
          void superAssistantData.refresh();
          return;
        }
        Message.success(t('cron.runNowSuccess', { defaultValue: '已触发执行' }));
      } catch (error) {
        Message.error(String(error));
      }
    },
    [superAssistantData, t, user?.id]
  );

  const currentTab = activeTab;

  useEffect(() => {
    if (routedState.issueId && issueLookup[routedState.issueId]) {
      setSelectedIssueId((prev) => (prev === routedState.issueId ? prev : routedState.issueId));
    }
  }, [issueLookup, routedState.issueId]);

  const ensureTeamSession = useCallback(
    async (teamId: string, fallbackMessage: string) => {
      try {
        const tenantId = teams.find((team) => team.id === teamId)?.tenantId;
        await ipcBridge.team.ensureSession.invoke({ teamId, tenantId });
        return true;
      } catch (error) {
        Message.error(getEnterpriseActionError(error, fallbackMessage));
        return false;
      }
    },
    [teams]
  );

  const handleDeleteAgent = useCallback(
    async (managed: ManagedAgentRef) => {
      const ownerUserId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
      try {
        const result =
          managed.scope === 'personal'
            ? await deletePersonalDigitalEmployee({ id: managed.slotId, ownerUserId })
            : await deleteTeamDigitalEmployee({
                teamId: managed.teamId,
                tenantId: managed.tenantId,
                slotId: managed.slotId,
              });
        setManagingAgent(null);
        await superAssistantData.refresh();
        await refreshCollaborationTeams();
        Message.success(
          t('common.superAssistant.deleteAgentSuccess', {
            defaultValue: '已删除数字员工{{cronHint}}',
            cronHint:
              result.removedCronJobs > 0
                ? t('common.superAssistant.deleteAgentCronHint', {
                    defaultValue: '（含 {{count}} 个定时任务）',
                    count: result.removedCronJobs,
                  })
                : '',
          })
        );
      } catch (error) {
        Message.error(
          getEnterpriseActionError(
            error,
            t('common.superAssistant.deleteAgentFailed', { defaultValue: '删除数字员工失败' })
          )
        );
        throw error;
      }
    },
    [refreshCollaborationTeams, superAssistantData, t, user?.id]
  );

  const handleRunAgentNow = useCallback(
    async (ref: AgentCardRef | ManagedAgentRef): Promise<void> => {
      const managed = 'teamAgent' in ref ? ref : resolveManagedAgent(teams, superAssistantData.agentExecutionGroups, ref);
      if (!managed) {
        return;
      }
      if (managed.scope === 'personal') {
        try {
          const ownerUserId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
          const issueContext = currentIssue
            ? { id: currentIssue.id, subject: currentIssue.subject, description: currentIssue.description }
            : undefined;
          await ipcBridge.personalAgent.runNow.invoke({
            agentId: managed.slotId,
            ownerUserId,
            issue: issueContext,
          });
          Message.success(
            t('common.superAssistant.digitalEmployee.runStarted', {
              defaultValue: '已在工作区后台开始执行，可在「查看详情」跟踪进度',
            })
          );
          setDigitalEmployeeDetailTarget(buildDigitalEmployeeDetailTarget(managed));
          await superAssistantData.refresh();
        } catch (error) {
          Message.error(getEnterpriseActionError(error, t('common.superAssistant.agentRunNowFailed', { defaultValue: '启动智能体会话失败' })));
        }
        return;
      }
      try {
        const issueContext = currentIssue
          ? {
              id: currentIssue.id,
              subject: currentIssue.subject,
              description: currentIssue.description,
            }
          : undefined;
        await ipcBridge.team.runDigitalEmployeeNow.invoke({
          teamId: managed.teamId,
          tenantId: managed.tenantId,
          slotId: managed.slotId,
          issue: issueContext,
        });
        Message.success(
          t('common.superAssistant.digitalEmployee.runStarted', {
            defaultValue: '已在工作区后台开始执行，可在「查看详情」跟踪进度',
          })
        );
        setDigitalEmployeeDetailTarget(buildDigitalEmployeeDetailTarget(managed));
        await superAssistantData.refresh();
        await refreshCollaborationTeams();
      } catch (error) {
        Message.error(getEnterpriseActionError(error, t('common.superAssistant.agentRunNowFailed', { defaultValue: '启动智能体会话失败' })));
      }
    },
    [
      buildDigitalEmployeeDetailTarget,
      currentIssue,
      refreshCollaborationTeams,
      superAssistantData,
      t,
      teams,
      user?.id,
    ]
  );

  const handleViewDigitalEmployeeDetail = useCallback(
    (ref: AgentCardRef) => {
      const managed = resolveManagedAgent(teams, superAssistantData.agentExecutionGroups, ref);
      if (!managed) {
        return;
      }
      setDigitalEmployeeDetailTarget(buildDigitalEmployeeDetailTarget(managed));
    },
    [buildDigitalEmployeeDetailTarget, superAssistantData.agentExecutionGroups, teams]
  );

  const handleCloseDigitalEmployeeDetail = useCallback(() => {
    setDigitalEmployeeDetailTarget(null);
  }, []);

  const handleOpenDigitalEmployeeConversation = useCallback(
    (conversationId: string) => {
      navigate(`/conversation/${conversationId}`);
    },
    [navigate]
  );

  const handleOpenCreateDigitalEmployee = useCallback(() => {
    setCreateDigitalEmployeeVisible(true);
  }, []);

  const agentTabHandlers = useMemo(
    () => ({
      onCreateAgent: handleOpenCreateDigitalEmployee,
      onManageAgent: handleManageAgent,
      onRunAgentNow: (ref: AgentCardRef): void => {
        void handleRunAgentNow(ref);
      },
      onScheduleAgent: handleScheduleAgent,
      onViewDigitalEmployeeDetail: handleViewDigitalEmployeeDetail,
      onDeleteAgent: async (ref: AgentCardRef) => {
        const managed = resolveManagedAgent(teams, superAssistantData.agentExecutionGroups, ref);
        if (!managed) {
          return;
        }
        await handleDeleteAgent(managed);
      },
    }),
    [
      handleDeleteAgent,
      handleManageAgent,
      handleOpenCreateDigitalEmployee,
      handleRunAgentNow,
      handleScheduleAgent,
      handleViewDigitalEmployeeDetail,
      superAssistantData.agentExecutionGroups,
      teams,
    ]
  );

  const handleBreakdownIssue = () => {
    if (!currentIssue) {
      navigate(showTeamsFeature ? '/enterprise/cteam' : '/issues');
      return;
    }
    navigate(
      buildIssuePlanningPath({
        issueId: currentIssue.id,
        issueSubject: currentIssue.subject,
        teamsCollaborationEnabled: showTeamsFeature,
      })
    );
  };
  const handleSwitchTab = useCallback(
    (tab: SuperAssistantTab) => {
      setActiveTab(tab);
      storeSuperAssistantTab(tab);
      const nextPath = buildSuperAssistantPath({
        tab,
        issueId: currentIssue?.id ?? routedState.issueId,
      });
      const nextSearch = nextPath.includes('?') ? nextPath.slice(nextPath.indexOf('?')) : '';
      lastExternalSearchRef.current = nextSearch;
      if (isElectronDesktop()) {
        if (typeof window !== 'undefined' && window.location.hash !== `#${nextPath}`) {
          window.location.hash = `#${nextPath}`;
        }
        return;
      }
      void navigate(nextPath, { replace: true });
    },
    [currentIssue?.id, navigate, routedState.issueId]
  );
  const handleOpenTeamFlow = async () => {
    if (!showTeamsFeature) {
      await handleStartCurrentIssue();
      return;
    }
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
    if (!showTeamsFeature && !showEnterpriseAdminNav) {
      Message.info(
        t('common.superAssistant.personalEditionNoEnterpriseConsole', {
          defaultValue: '个人版无需企业控制台，请使用数字员工或 WebUI 设置。',
        })
      );
      return;
    }
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
  }, [enterpriseMode.openEnterpriseAdminInBrowser, navigate, showEnterpriseAdminNav, showTeamsFeature, t]);
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
        tenantId: superAssistantData.primaryTeam.tenantId,
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
      if (routedState.autoStart && routedState.issueId && superAssistantData.loading) {
        return;
      }
      navigate('/issues');
      return;
    }
    if (!showTeamsFeature) {
      const personalAgentRef = resolvePrimaryPersonalAgentRef(superAssistantData.agentExecutionGroups);
      if (personalAgentRef) {
        await handleRunAgentNow(personalAgentRef);
        return;
      }
      Message.info(
        t('common.superAssistant.personalAgentRequired', {
          defaultValue: '请先在「数字员工」中创建个人 Agent，再处理 Issue。',
        })
      );
      handleSwitchTab('agents');
      return;
    }
    if (currentIssueAssignment) {
      await handleOpenAssignedAgent();
      return;
    }
    if (primaryLeadAgent) {
      await handleAssignIssue(primaryLeadAgent.slotId, primaryLeadAgent.agentName, { navigateAfter: false });
      openAgentFleet();
      return;
    }
    await handleOpenTeamFlow();
  };

  useEffect(() => {
    if (!routedState.autoStart || !routedState.issueId) {
      return;
    }
    if (!issueLookup[routedState.issueId]) {
      return;
    }
    if (autoStartIssueRef.current === routedState.issueId) {
      return;
    }
    autoStartIssueRef.current = routedState.issueId;
    void handleStartCurrentIssue();
  }, [issueLookup, routedState.autoStart, routedState.issueId]);

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

  return (
    <div className='h-full overflow-auto px-20px py-16px'>
      <SuperAssistantHeader
        tenantLabel={tenantLabel}
        isAdmin={isAdmin}
        openIssueCount={superAssistantData.openIssueCount}
        activeAgentCount={superAssistantData.activeAgentCount}
        skillCount={superAssistantData.skillCount}
        onStartCurrentIssue={() => void handleStartCurrentIssue()}
        onOpenRecentRun={openAgentFleet}
        onOpenIssues={() => navigate('/issues')}
      />
      <div className='space-y-12px'>
        <Card>
          <div className='flex items-center gap-8px flex-wrap'>
            {([
              ['overview', t('common.superAssistant.tabs.workbench', { defaultValue: '工作台' })],
              ['agents', t('common.superAssistant.tabs.agents', { defaultValue: '数字员工' })],
              ['issues', t('common.superAssistant.tabs.dispatch', { defaultValue: '调度视图' })],
              ['skills', t('common.superAssistant.tabs.skills', { defaultValue: 'Skills' })],
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
            <Card>
              <div className='text-14px font-600 text-t-primary'>
                {t('common.superAssistant.howToUseTitle', { defaultValue: '如何使用 Agent 助手' })}
              </div>
              <ol className='mt-10px mb-0 pl-18px text-13px text-t-secondary space-y-6px'>
                <li>
                  {t('common.superAssistant.howToUseStep1', {
                    defaultValue: '在 Issues 中打开或选中一个需求（Issue）。',
                  })}
                </li>
                <li>
                  {t('common.superAssistant.howToUseStep2', {
                    defaultValue: '回到本页，在「Issue 队列」中点选 Issue，或点击「开始处理当前 Issue」。',
                  })}
                </li>
                <li>
                  {t('common.superAssistant.howToUseStep3', {
                    defaultValue: '在「运行时」查看 Agent 执行进度；需要分派多个 Agent 时进入「调度视图」。',
                  })}
                </li>
              </ol>
              <div className='mt-12px flex items-center gap-8px flex-wrap'>
                <Button size='small' type='primary' onClick={() => navigate('/issues')}>
                  {t('common.superAssistant.howToUseOpenIssues', { defaultValue: '去 Issues 选择任务' })}
                </Button>
                <Button size='small' type='outline' onClick={openAgentFleet}>
                  {t('common.superAssistant.openOrgNodes', { defaultValue: '打开组织节点' })}
                </Button>
              </div>
            </Card>
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
                  <div className='flex flex-col items-center gap-12px'>
                    <Empty
                      description={t('common.superAssistant.noIssuesPickOne', {
                        defaultValue: '请先在 Issues 中选择一个 Issue，再在此开始处理。',
                      })}
                    />
                    <Button type='primary' size='small' onClick={() => navigate('/issues')}>
                      {t('common.superAssistant.howToUseOpenIssues', { defaultValue: '去 Issues 选择任务' })}
                    </Button>
                  </div>
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
                      <Button size='small' type='outline' onClick={openAgentFleet}>
                        {t('common.superAssistant.headerRecentRun', { defaultValue: '查看组织节点' })}
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
        {currentTab === 'agents' ? (
          <AgentsTab executionGroups={superAssistantData.agentExecutionGroups} {...agentTabHandlers} />
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
                showOrgNodesLink={hasCollaborationTeam}
                onOpenOrgNodes={openAgentFleet}
              />
            </div>
          </Card>
        ) : null}
        {currentTab === 'settings' ? (
          <Card title={t('common.superAssistant.rebuild.systemConfigTitle', { defaultValue: '系统配置入口' })}>
            <SettingsTab
              isAdmin={isAdmin}
              showEnterpriseConsole={showTeamsFeature || showEnterpriseAdminNav}
              onOpenEnterpriseConsole={() => void handleOpenEnterpriseModule()}
              onOpenWebuiSettings={() => navigate('/settings/webui')}
            />
          </Card>
        ) : null}
      </div>
      <CreateWorkspaceAgentModal
        visible={createDigitalEmployeeVisible}
        teams={teams}
        defaultTeamId={superAssistantData.primaryTeam?.id ?? teams[0]?.id}
        workspaceEnabled={canUseWorkspaceVisibility}
        workspaceUnavailableHint={
          hasCollaborationTeam
            ? undefined
            : t('common.superAssistant.workspaceTeamRequiredHint', {
                defaultValue:
                  '你已加入企业组织，但还没有可用的「协同团队」。请让管理员在「企业后台 → 团队」把你加入团队，或在「全部会话」中点击「新建团队会话」创建团队后再选择工作区可见性。',
              })
        }
        onClose={() => setCreateDigitalEmployeeVisible(false)}
        onConfirm={async (payload) => {
          const managed = await handleCreateWorkspaceAgent(payload);
          setCreateDigitalEmployeeVisible(false);
          if (managed) {
            setManagingAgent(managed);
          }
        }}
      />
      <DigitalEmployeeDetailModal
        visible={Boolean(digitalEmployeeDetailTarget)}
        target={digitalEmployeeDetailTarget}
        onClose={handleCloseDigitalEmployeeDetail}
        onOpenConversation={handleOpenDigitalEmployeeConversation}
      />
      <ManageWorkspaceAgentModal
        visible={Boolean(managingAgent)}
        agent={managingAgent}
        onClose={() => setManagingAgent(null)}
        onSaveName={handleSaveAgentName}
        onRunNow={handleRunAgentNow}
        initialSkillIds={managedSkillIds}
        onSaveSkillIds={
          managingAgent
            ? async (skillIds) => {
                await handleSaveAgentSkills(managingAgent, skillIds);
              }
            : undefined
        }
        onOpenExecutionModules={() => {
          setManagingAgent(null);
          openAgentFleet();
        }}
        onOpenDispatchView={() => {
          setManagingAgent(null);
          handleSwitchTab('issues');
        }}
        onDelete={handleDeleteAgent}
        onAddAutomation={(managed) => {
          setManagingAgent(null);
          void openAgentAutomationDialog(managed);
        }}
        onEditAutomation={(managed, job) => {
          setManagingAgent(null);
          void openAgentAutomationDialog(managed, job);
        }}
        onRunAutomation={handleRunAutomationJob}
      />
      {agentAutomationVisible ? (
        <CreateTaskDialog
          visible={agentAutomationVisible}
          onClose={closeAgentAutomationDialog}
          editJob={editingCronJob}
          conversationTitle={automationAgent?.agentName ?? currentIssue?.subject ?? 'Agent 自动化'}
          initialName={
            editingCronJob?.name ??
            (automationAgent
              ? t('common.superAssistant.agentAutomationDefaultNameForAgent', {
                  defaultValue: '{{agent}} · 定时巡检',
                  agent: automationAgent.agentName,
                })
              : currentIssue
                ? t('common.issues.automationDefaultName', {
                    defaultValue: 'Issue 自动跟进 · {{subject}}',
                    subject: currentIssue.subject,
                  })
                : t('common.superAssistant.agentAutomationDefaultName', { defaultValue: 'Agent 定时巡检' }))
          }
          initialPrompt={
            editingCronJob?.target.payload.text ??
            automationInitialPrompt ??
            (automationAgent?.scope === 'personal'
              ? undefined
              : currentIssue
                ? t('common.issues.automationDefaultPrompt', {
                    defaultValue:
                      '你是 Issue「{{subject}}」的值班 Agent。请检查当前进展、阻塞项与下一步行动，输出简洁 Markdown 摘要。',
                    subject: currentIssue.subject,
                  })
                : t('common.superAssistant.agentAutomationDefaultPrompt', {
                    defaultValue: '扫描团队未关闭 Issue 与阻塞项，输出摘要并 @ 相关负责人。',
                  }))
          }
          initialFrequency='weekdays'
          initialAgentKey={selectedAgentAutopilotDefaults?.initialAgentKey}
          autopilotContext={selectedAgentAutopilotDefaults?.autopilotContext}
        />
      ) : null}
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
