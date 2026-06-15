import { useCallback, useEffect, useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import type {
  CodeRepo,
  McpRegistryRecord,
  PipelineListItem,
  RagDocumentRecord,
  RequirementPriority,
  RequirementRecord,
  SkillRecord,
} from '@/renderer/utils/enterpriseApi/modules';
import {
  listCodeRepos,
  listMcpRegistry,
  listPipelines,
  listRagDocuments,
  listRequirementsTree,
  listSkills,
} from '@/renderer/utils/enterpriseApi/modules';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';
import type { TeamAgent, TeammateStatus, TTeam } from '@/common/types/teamTypes';
import type { PersonalAgent } from '@/common/types/personalAgentTypes';
import type { DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';

export type SuperAssistantBoardColumn = {
  key: 'unassigned' | 'active' | 'review' | 'done';
  count: number;
  latestSubject?: string;
  items: SuperAssistantIssueItem[];
};

export type SuperAssistantIssueItem = {
  id: string;
  subject: string;
  description: string | null;
  status: RequirementRecord['status'];
  priority: RequirementPriority;
};

export type SuperAssistantFeaturedIssue = SuperAssistantIssueItem;

export type SuperAssistantTeamSummary = {
  id: string;
  name: string;
  workspace: string;
  agentCount: number;
  activeAgentCount: number;
  conversationCount: number;
  sampleAgentNames: string[];
};

export type SuperAssistantAgentExecutionItem = {
  teamId: string;
  teamName: string;
  teamWorkspace: string;
  teamConversationCount: number;
  slotId: string;
  agentName: string;
  role: TeamAgent['role'];
  agentType: string;
  conversationType: string;
  status: TeammateStatus;
  currentIssueSubject: string | null;
  queuedIssueSubject: string | null;
  blockerMessage: string | null;
  dependencyNames: string[];
  /** Personal digital employee background run (card + detail). */
  digitalEmployeeRun?: DigitalEmployeeRunRecord;
};

export type SuperAssistantAgentExecutionGroup = {
  teamId: string;
  teamName: string;
  workspace: string;
  conversationCount: number;
  agentCount: number;
  activeAgentCount: number;
  agents: SuperAssistantAgentExecutionItem[];
};

export type SuperAssistantIssueAssignmentRecord = {
  issueId: string;
  issueSubject: string;
  teamId: string;
  teamName: string;
  slotId: string;
  agentName: string;
  assignedAt: number;
  manualStatus?: TeammateStatus;
  manualBlockerMessage?: string | null;
};

export type SuperAssistantIssueAssignmentMap = Record<string, SuperAssistantIssueAssignmentRecord>;

type UseSuperAssistantDataResult = {
  loading: boolean;
  refresh: () => Promise<void>;
  boardColumns: SuperAssistantBoardColumn[];
  featuredIssue: SuperAssistantFeaturedIssue | null;
  teams: TTeam[];
  teamSummaries: SuperAssistantTeamSummary[];
  primaryTeam: TTeam | null;
  teamConversationCount: number;
  visibleIssueCount: number;
  openIssueCount: number;
  totalAgentCount: number;
  activeAgentCount: number;
  agentExecutionGroups: SuperAssistantAgentExecutionGroup[];
  issueLookup: Record<string, SuperAssistantIssueItem>;
  skillCount: number;
  skillNames: string[];
  enabledMcpCount: number;
  mcpNames: string[];
  ragDocumentCount: number;
  ragChunkCount: number;
  codeRepoCount: number;
  pipelineCount: number;
  openAssigneeUserIds: string[];
};

type RuntimeStatusInfo = {
  status: TeammateStatus;
  lastMessage?: string;
};

const FAILED_AGENTS_KEY = 'team-failed-agents';

function getRuntimeKey(teamId: string, slotId: string): string {
  return `${teamId}:${slotId}`;
}

function loadFailedAgents(teamId: string): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(FAILED_AGENTS_KEY) ?? '{}') as Record<string, string[]>;
    return new Set(stored[teamId] ?? []);
  } catch {
    return new Set();
  }
}

function flattenRequirements(items: RequirementRecord[]): RequirementRecord[] {
  return items.flatMap((item) => [item, ...flattenRequirements(item.children ?? [])]);
}

function readConversationTeamId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== 'object') {
    return undefined;
  }
  const teamId = (extra as { teamId?: unknown }).teamId;
  return typeof teamId === 'string' && teamId.length > 0 ? teamId : undefined;
}

function priorityRank(priority: RequirementPriority): number {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
}

export function useSuperAssistantData(
  enabled: boolean,
  isAdmin: boolean,
  issueAssignments: SuperAssistantIssueAssignmentMap = {}
): UseSuperAssistantDataResult {
  const { user } = useAuth();
  const { conversations } = useConversationHistoryContext();
  const { teams } = useTeamList();
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [mcpRegistry, setMcpRegistry] = useState<McpRegistryRecord[]>([]);
  const [ragDocuments, setRagDocuments] = useState<RagDocumentRecord[]>([]);
  const [codeRepos, setCodeRepos] = useState<CodeRepo[]>([]);
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [personalAgents, setPersonalAgents] = useState<PersonalAgent[]>([]);
  const [runtimeStatusMap, setRuntimeStatusMap] = useState<Map<string, RuntimeStatusInfo>>(new Map());
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setRequirements([]);
      setSkills([]);
      setMcpRegistry([]);
      setRagDocuments([]);
      setCodeRepos([]);
      setPipelines([]);
      setPersonalAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ownerUserId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
    const loadEnterpriseAdminData = isAdmin;
    const [
      requirementsResult,
      skillsResult,
      mcpResult,
      ragResult,
      codeRepoResult,
      pipelineResult,
      personalAgentsResult,
    ] = await Promise.allSettled([
      listRequirementsTree(),
      listSkills(),
      loadEnterpriseAdminData ? listMcpRegistry() : Promise.resolve([]),
      loadEnterpriseAdminData ? listRagDocuments() : Promise.resolve([]),
      loadEnterpriseAdminData ? listCodeRepos() : Promise.resolve([]),
      loadEnterpriseAdminData ? listPipelines() : Promise.resolve([]),
      ipcBridge.personalAgent.list.invoke({ ownerUserId }),
    ]);
    setRequirements(requirementsResult.status === 'fulfilled' ? (requirementsResult.value ?? []) : []);
    setSkills(skillsResult.status === 'fulfilled' ? (skillsResult.value ?? []) : []);
    setMcpRegistry(mcpResult.status === 'fulfilled' ? (mcpResult.value ?? []) : []);
    setRagDocuments(ragResult.status === 'fulfilled' ? (ragResult.value ?? []) : []);
    setCodeRepos(codeRepoResult.status === 'fulfilled' ? (codeRepoResult.value ?? []) : []);
    setPipelines(pipelineResult.status === 'fulfilled' ? (pipelineResult.value ?? []) : []);
    setPersonalAgents(personalAgentsResult.status === 'fulfilled' ? (personalAgentsResult.value ?? []) : []);
    setLoading(false);
  }, [enabled, isAdmin, user?.id]);

  useEffect(() => {
    let disposed = false;
    void refresh().catch(() => {
      if (!disposed) {
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
    };
  }, [refresh]);

  const teamSessionKey = useMemo(() => teams.map((team) => `${team.id}:${team.tenantId ?? ''}`).join('|'), [teams]);
  const runtimeTeamsSnapshot = useMemo(() => teams, [teamSessionKey]);

  useEffect(() => {
    if (!enabled) {
      setRuntimeStatusMap(new Map());
      return;
    }

    setRuntimeStatusMap(
      new Map(
        runtimeTeamsSnapshot.flatMap((team) => {
          const failedAgents = loadFailedAgents(team.id);
          return team.agents.map((agent): [string, RuntimeStatusInfo] => [
            getRuntimeKey(team.id, agent.slotId),
            {
              status: failedAgents.has(agent.slotId) ? 'failed' : agent.status,
            },
          ]);
        })
      )
    );

    const unsubscribe = ipcBridge.team.agentStatusChanged.on((event) => {
      setRuntimeStatusMap((prev) => {
        const next = new Map(prev);
        next.set(getRuntimeKey(event.teamId, event.slotId), {
          status: event.status,
          lastMessage: event.lastMessage,
        });
        return next;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, runtimeTeamsSnapshot]);

  const visibleRequirements = useMemo(() => {
    const flattened = flattenRequirements(requirements).filter((item) => item.type !== 'epic');
    if (isAdmin) {
      return flattened;
    }
    const userId = user?.id ?? DESKTOP_OPERATOR_USER_ID;
    return flattened.filter((item) => item.assigned_to === userId || item.creator_id === userId);
  }, [isAdmin, requirements, user?.id]);

  const prioritizedOpenIssues = useMemo(
    () =>
      [...visibleRequirements]
        .filter((item) => item.status !== 'completed')
        .toSorted((a, b) => {
          const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
          if (priorityDelta !== 0) {
            return priorityDelta;
          }
          return b.updated_at - a.updated_at;
        }),
    [visibleRequirements]
  );

  const boardColumns = useMemo<SuperAssistantBoardColumn[]>(() => {
    const sortItems = (items: RequirementRecord[]): RequirementRecord[] =>
      items.toSorted((a, b) => {
        const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return b.updated_at - a.updated_at;
      });
    const pickLatest = (items: RequirementRecord[]): string | undefined => sortItems(items)[0]?.subject;
    const toIssueItems = (items: RequirementRecord[]): SuperAssistantIssueItem[] =>
      sortItems(items).map((item) => ({
        id: item.id,
        subject: item.subject,
        description: item.description,
        status: item.status,
        priority: item.priority,
      }));

    const unassigned = visibleRequirements.filter((item) => item.status === 'backlog' || item.status === 'planning');
    const active = visibleRequirements.filter((item) => item.status === 'developing');
    const review = visibleRequirements.filter((item) => item.status === 'testing');
    const done = visibleRequirements.filter((item) => item.status === 'completed');

    return [
      {
        key: 'unassigned',
        count: unassigned.length,
        latestSubject: pickLatest(unassigned),
        items: toIssueItems(unassigned),
      },
      {
        key: 'active',
        count: active.length,
        latestSubject: pickLatest(active),
        items: toIssueItems(active),
      },
      {
        key: 'review',
        count: review.length,
        latestSubject: pickLatest(review),
        items: toIssueItems(review),
      },
      {
        key: 'done',
        count: done.length,
        latestSubject: pickLatest(done),
        items: toIssueItems(done),
      },
    ];
  }, [visibleRequirements]);

  const featuredIssue = useMemo<SuperAssistantFeaturedIssue | null>(() => {
    const sorted = [...visibleRequirements].toSorted((a, b) => {
      const aCompleted = a.status === 'completed' ? 1 : 0;
      const bCompleted = b.status === 'completed' ? 1 : 0;
      if (aCompleted !== bCompleted) {
        return aCompleted - bCompleted;
      }
      const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return b.updated_at - a.updated_at;
    });
    const target = sorted[0];
    if (!target) {
      return null;
    }
    return {
      id: target.id,
      subject: target.subject,
      description: target.description,
      status: target.status,
      priority: target.priority,
    };
  }, [visibleRequirements]);

  const teamConversationCountByTeam = useMemo(() => {
    const visibleTeamIds = new Set(teams.map((team) => team.id));
    const counts = new Map<string, number>();
    conversations.forEach((conversation) => {
      const teamId = readConversationTeamId(conversation.extra);
      if (!teamId) {
        return;
      }
      if (!isAdmin && !visibleTeamIds.has(teamId)) {
        return;
      }
      counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    });
    return counts;
  }, [conversations, isAdmin, teams]);

  const teamConversationCount = useMemo(
    () => [...teamConversationCountByTeam.values()].reduce((sum, count) => sum + count, 0),
    [teamConversationCountByTeam]
  );

  const teamSummaries = useMemo<SuperAssistantTeamSummary[]>(
    () =>
      teams.map((team) => ({
        id: team.id,
        name: team.name,
        workspace: team.workspace,
        agentCount: team.agents.length,
        activeAgentCount: team.agents.filter((agent) => agent.status === 'active').length,
        conversationCount: teamConversationCountByTeam.get(team.id) ?? 0,
        sampleAgentNames: team.agents.slice(0, 3).map((agent) => agent.agentName),
      })),
    [teamConversationCountByTeam, teams]
  );

  const totalAgentCount = useMemo(
    () => personalAgents.length + teams.reduce((sum, team) => sum + team.agents.length, 0),
    [personalAgents.length, teams]
  );

  const activeAgentCount = useMemo(
    () => teams.reduce((sum, team) => sum + team.agents.filter((agent) => agent.status === 'active').length, 0),
    [teams]
  );

  const enabledMcpNames = useMemo(
    () => mcpRegistry.filter((item) => item.enabled).map((item) => item.name),
    [mcpRegistry]
  );

  const agentExecutionGroups = useMemo<SuperAssistantAgentExecutionGroup[]>(
    () => [
      ...(personalAgents.length > 0
        ? [
            {
              teamId: 'personal',
              teamName: '个人数字员工',
              workspace: '',
              conversationCount: 0,
              agentCount: personalAgents.length,
              activeAgentCount: 0,
              agents: personalAgents.map(
                (agent): SuperAssistantAgentExecutionItem => ({
                  teamId: 'personal',
                  teamName: '个人数字员工',
                  teamWorkspace: '',
                  teamConversationCount: 0,
                  slotId: agent.id,
                  agentName: agent.name,
                  role: 'teammate',
                  agentType: agent.agentType,
                  conversationType: agent.conversationType,
                  status: 'idle',
                  currentIssueSubject: null,
                  queuedIssueSubject: prioritizedOpenIssues[0]?.subject ?? null,
                  blockerMessage: null,
                  dependencyNames: [skills[0]?.name ?? '', enabledMcpNames[0] ?? ''].filter(Boolean),
                  digitalEmployeeRun: agent.automationConfig?.lastRun,
                })
              ),
            } satisfies SuperAssistantAgentExecutionGroup,
          ]
        : []),
      ...teams.map((team) => {
        const assignedIssuesBySlot = new Map<string, RequirementRecord>();
        const assignedIssueIds = new Set<string>();
        Object.values(issueAssignments).forEach((assignment) => {
          if (assignment.teamId !== team.id) {
            return;
          }
          const matchedIssue = visibleRequirements.find((issue) => issue.id === assignment.issueId);
          if (!matchedIssue || matchedIssue.status === 'completed') {
            return;
          }
          assignedIssuesBySlot.set(assignment.slotId, matchedIssue);
          assignedIssueIds.add(matchedIssue.id);
        });

        const remainingIssues = prioritizedOpenIssues.filter((issue) => !assignedIssueIds.has(issue.id));
        const runtimeAwareAgents = team.agents.map((agent) => {
          const runtimeStatus = runtimeStatusMap.get(getRuntimeKey(team.id, agent.slotId));
          return {
            ...agent,
            runtimeStatus: runtimeStatus?.status ?? agent.status,
            blockerMessage: runtimeStatus?.lastMessage ?? null,
          };
        });
        const activelyRunningAgents = runtimeAwareAgents.filter((agent) => agent.runtimeStatus === 'active');
        const queuedIssues = remainingIssues.slice(activelyRunningAgents.length);
        let activeIssueCursor = 0;
        let queuedIssueCursor = 0;

        return {
          teamId: team.id,
          teamName: team.name,
          workspace: team.workspace,
          conversationCount: teamConversationCountByTeam.get(team.id) ?? 0,
          agentCount: team.agents.length,
          activeAgentCount: activelyRunningAgents.length,
          agents: runtimeAwareAgents.map((agent, index): SuperAssistantAgentExecutionItem => {
            const dependencyNames = [
              team.workspace,
              skills[index]?.name ?? skills[0]?.name ?? '',
              enabledMcpNames[0] ?? '',
            ].filter(Boolean);
            const assignment = Object.values(issueAssignments).find(
              (item) => item.teamId === team.id && item.slotId === agent.slotId
            );
            const assignedIssue = assignedIssuesBySlot.get(agent.slotId) ?? null;
            const resolvedStatus = assignment?.manualStatus ?? agent.runtimeStatus;
            const resolvedBlockerMessage = assignment?.manualBlockerMessage ?? agent.blockerMessage;

            if (assignedIssue) {
              return {
                teamId: team.id,
                teamName: team.name,
                teamWorkspace: team.workspace,
                teamConversationCount: teamConversationCountByTeam.get(team.id) ?? 0,
                slotId: agent.slotId,
                agentName: agent.agentName,
                role: agent.role,
                agentType: agent.agentType,
                conversationType: agent.conversationType,
                status: resolvedStatus,
                currentIssueSubject: assignedIssue.subject,
                queuedIssueSubject: null,
                blockerMessage: resolvedBlockerMessage,
                dependencyNames,
                digitalEmployeeRun: agent.lastRun,
              };
            }

            if (agent.runtimeStatus === 'active' || agent.runtimeStatus === 'completed') {
              const currentIssue = remainingIssues[activeIssueCursor] ?? remainingIssues[0] ?? null;
              activeIssueCursor += 1;
              return {
                teamId: team.id,
                teamName: team.name,
                teamWorkspace: team.workspace,
                teamConversationCount: teamConversationCountByTeam.get(team.id) ?? 0,
                slotId: agent.slotId,
                agentName: agent.agentName,
                role: agent.role,
                agentType: agent.agentType,
                conversationType: agent.conversationType,
                status: resolvedStatus,
                currentIssueSubject: currentIssue?.subject ?? null,
                queuedIssueSubject: null,
                blockerMessage: resolvedBlockerMessage,
                dependencyNames,
                digitalEmployeeRun: agent.lastRun,
              };
            }

            const queuedIssue = queuedIssues[queuedIssueCursor] ?? remainingIssues[index] ?? null;
            queuedIssueCursor += 1;
            return {
              teamId: team.id,
              teamName: team.name,
              teamWorkspace: team.workspace,
              teamConversationCount: teamConversationCountByTeam.get(team.id) ?? 0,
              slotId: agent.slotId,
              agentName: agent.agentName,
              role: agent.role,
              agentType: agent.agentType,
              conversationType: agent.conversationType,
              status: resolvedStatus,
              currentIssueSubject: null,
              queuedIssueSubject: queuedIssue?.subject ?? null,
              blockerMessage: resolvedBlockerMessage,
              dependencyNames,
              digitalEmployeeRun: agent.lastRun,
            };
          }),
        } satisfies SuperAssistantAgentExecutionGroup;
      }),
    ],
    [
      enabledMcpNames,
      issueAssignments,
      personalAgents,
      prioritizedOpenIssues,
      runtimeStatusMap,
      skills,
      teamConversationCountByTeam,
      teams,
      visibleRequirements,
    ]
  );

  const openAssigneeUserIds = useMemo(
    () => [
      ...new Set(
        visibleRequirements
          .filter((item) => item.status !== 'completed' && item.assigned_to)
          .map((item) => item.assigned_to as string)
      ),
    ],
    [visibleRequirements]
  );

  const issueLookup = useMemo(
    () =>
      Object.fromEntries(
        visibleRequirements.map((item) => [
          item.id,
          {
            id: item.id,
            subject: item.subject,
            description: item.description,
            status: item.status,
            priority: item.priority,
          } satisfies SuperAssistantIssueItem,
        ])
      ),
    [visibleRequirements]
  );

  const primaryTeam = useMemo(() => teams[0] ?? null, [teamSessionKey]);

  return {
    loading,
    refresh,
    boardColumns,
    featuredIssue,
    teams,
    teamSummaries,
    primaryTeam,
    teamConversationCount,
    visibleIssueCount: visibleRequirements.length,
    openIssueCount: visibleRequirements.filter((item) => item.status !== 'completed').length,
    totalAgentCount,
    activeAgentCount,
    agentExecutionGroups,
    issueLookup,
    skillCount: skills.length,
    skillNames: skills.slice(0, 3).map((skill) => skill.name),
    enabledMcpCount: mcpRegistry.filter((item) => item.enabled).length,
    mcpNames: mcpRegistry
      .filter((item) => item.enabled)
      .slice(0, 3)
      .map((item) => item.name),
    ragDocumentCount: ragDocuments.length,
    ragChunkCount: ragDocuments.reduce((sum, doc) => sum + (Number(doc.chunk_count) || 0), 0),
    codeRepoCount: codeRepos.length,
    pipelineCount: pipelines.length,
    openAssigneeUserIds,
  };
}
