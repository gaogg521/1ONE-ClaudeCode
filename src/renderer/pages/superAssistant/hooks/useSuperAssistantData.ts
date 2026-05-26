import { useEffect, useMemo, useState } from 'react';
import type {
  McpRegistryRecord,
  RequirementPriority,
  RequirementRecord,
  SkillRecord,
} from '@/renderer/utils/enterpriseApi/modules';
import { listMcpRegistry, listRequirementsTree, listSkills } from '@/renderer/utils/enterpriseApi/modules';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import type { TTeam } from '@/common/types/teamTypes';

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
  sampleAgentNames: string[];
};

type UseSuperAssistantDataResult = {
  loading: boolean;
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
  issueLookup: Record<string, SuperAssistantIssueItem>;
  skillCount: number;
  skillNames: string[];
  enabledMcpCount: number;
  mcpNames: string[];
};

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

export function useSuperAssistantData(enabled: boolean, isAdmin: boolean): UseSuperAssistantDataResult {
  const { user } = useAuth();
  const { conversations } = useConversationHistoryContext();
  const { teams } = useTeamList();
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [mcpRegistry, setMcpRegistry] = useState<McpRegistryRecord[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setRequirements([]);
      setLoading(false);
      return;
    }

    let disposed = false;
    setLoading(true);

    void Promise.allSettled([listRequirementsTree(), listSkills(), listMcpRegistry()])
      .then((results) => {
        if (disposed) {
          return;
        }
        const [requirementsResult, skillsResult, mcpResult] = results;
        setRequirements(requirementsResult.status === 'fulfilled' ? (requirementsResult.value ?? []) : []);
        setSkills(skillsResult.status === 'fulfilled' ? (skillsResult.value ?? []) : []);
        setMcpRegistry(mcpResult.status === 'fulfilled' ? (mcpResult.value ?? []) : []);
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [enabled]);

  const visibleRequirements = useMemo(() => {
    const flattened = flattenRequirements(requirements).filter((item) => item.type !== 'epic');
    if (isAdmin) {
      return flattened;
    }
    const userId = user?.id;
    if (!userId) {
      return [];
    }
    return flattened.filter((item) => item.assigned_to === userId || item.creator_id === userId);
  }, [isAdmin, requirements, user?.id]);

  const boardColumns = useMemo<SuperAssistantBoardColumn[]>(() => {
    const sortItems = (items: RequirementRecord[]): RequirementRecord[] =>
      [...items].sort((a, b) => {
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
    const sorted = [...visibleRequirements].sort((a, b) => {
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

  const teamConversationCount = useMemo(() => {
    const visibleTeamIds = new Set(teams.map((team) => team.id));
    return conversations.filter((conversation) => {
      const teamId = readConversationTeamId(conversation.extra);
      if (!teamId) {
        return false;
      }
      return isAdmin || visibleTeamIds.has(teamId);
    }).length;
  }, [conversations, isAdmin, teams]);

  const teamSummaries = useMemo<SuperAssistantTeamSummary[]>(
    () =>
      teams.map((team) => ({
        id: team.id,
        name: team.name,
        workspace: team.workspace,
        agentCount: team.agents.length,
        activeAgentCount: team.agents.filter((agent) => agent.status === 'active').length,
        sampleAgentNames: team.agents.slice(0, 3).map((agent) => agent.agentName),
      })),
    [teams]
  );

  const totalAgentCount = useMemo(
    () => teams.reduce((sum, team) => sum + team.agents.length, 0),
    [teams]
  );

  const activeAgentCount = useMemo(
    () =>
      teams.reduce(
        (sum, team) => sum + team.agents.filter((agent) => agent.status === 'active').length,
        0
      ),
    [teams]
  );

  return {
    loading,
    boardColumns,
    featuredIssue,
    teams,
    teamSummaries,
    primaryTeam: teams[0] ?? null,
    teamConversationCount,
    visibleIssueCount: visibleRequirements.length,
    openIssueCount: visibleRequirements.filter((item) => item.status !== 'completed').length,
    totalAgentCount,
    activeAgentCount,
    issueLookup: Object.fromEntries(
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
    skillCount: skills.length,
    skillNames: skills.slice(0, 3).map((skill) => skill.name),
    enabledMcpCount: mcpRegistry.filter((item) => item.enabled).length,
    mcpNames: mcpRegistry.slice(0, 3).map((item) => item.name),
  };
}
