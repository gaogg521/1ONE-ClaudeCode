import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editionFeaturesMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const listRequirementsTreeMock = vi.hoisted(() => vi.fn());
const listSkillsMock = vi.hoisted(() => vi.fn());
const listMcpRegistryMock = vi.hoisted(() => vi.fn());
const listRagDocumentsMock = vi.hoisted(() => vi.fn());
const listCodeReposMock = vi.hoisted(() => vi.fn());
const listPipelinesMock = vi.hoisted(() => vi.fn());
const updateRequirementMock = vi.hoisted(() => vi.fn());
const listTeamTasksMock = vi.hoisted(() => vi.fn());
const createTeamTaskMock = vi.hoisted(() => vi.fn());
const updateTeamTaskMock = vi.hoisted(() => vi.fn());
const deleteTeamTaskMock = vi.hoisted(() => vi.fn());
const useTeamListMock = vi.hoisted(() => vi.fn());
const conversationHistoryMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ pathname: '/super-assistant', search: '' }));
const ensureSessionMock = vi.hoisted(() => vi.fn());
const sendMessageToAgentMock = vi.hoisted(() => vi.fn());
const requirementTreeState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
}));
const teamTaskState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
}));
const teamRuntimeState = vi.hoisted(() => ({
  agentStatusListener: null as null | ((event: { teamId: string; slotId: string; status: string; lastMessage?: string }) => void),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; [key: string]: unknown }) => {
      const template = options?.defaultValue;
      if (!template) return _key;
      return Object.entries(options ?? {}).reduce((result, [key, value]) => {
        if (key === 'defaultValue') return result;
        return result.replaceAll(`{{${key}}}`, String(value ?? ''));
      }, template);
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      ensureSession: {
        invoke: ensureSessionMock,
      },
      sendMessageToAgent: {
        invoke: sendMessageToAgentMock,
      },
      agentStatusChanged: {
        on: vi.fn(
          (
            listener: (event: { teamId: string; slotId: string; status: string; lastMessage?: string }) => void
          ) => {
            teamRuntimeState.agentStatusListener = listener;
            return () => {
              teamRuntimeState.agentStatusListener = null;
            };
          }
        ),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMock(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationMock,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listRequirementsTree: () => listRequirementsTreeMock(),
  listSkills: () => listSkillsMock(),
  listMcpRegistry: () => listMcpRegistryMock(),
  listRagDocuments: () => listRagDocumentsMock(),
  listCodeRepos: () => listCodeReposMock(),
  listPipelines: () => listPipelinesMock(),
  updateRequirement: (...args: unknown[]) => updateRequirementMock(...args),
  listTeamTasks: (...args: unknown[]) => listTeamTasksMock(...args),
  createTeamTask: (...args: unknown[]) => createTeamTaskMock(...args),
  updateTeamTask: (...args: unknown[]) => updateTeamTaskMock(...args),
  deleteTeamTask: (...args: unknown[]) => deleteTeamTaskMock(...args),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => useTeamListMock(),
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => conversationHistoryMock(),
}));

vi.mock('@/renderer/pages/superAssistant/components/IssueCommentsPanel', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/superAssistant/components/CreateSharedTaskModal', () => ({
  default: ({ visible }: { visible?: boolean }) => (visible ? <div role='dialog'>CreateSharedTaskModal</div> : null),
}));

vi.mock('@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog', () => ({
  default: ({ visible }: { visible?: boolean }) => (visible ? <div role='dialog'>CreateTaskDialog</div> : null),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<Record<string, unknown> & { onClick?: () => void }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Card: ({
    title,
    extra,
    children,
  }: React.PropsWithChildren<{ title?: React.ReactNode; extra?: React.ReactNode }>) => (
    <section>
      {title ? <div>{title}</div> : null}
      {extra}
      {children}
    </section>
  ),
  Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Badge: ({ count, children }: React.PropsWithChildren<{ count?: number }>) => <span>{count ?? children}</span>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Modal: ({
    visible,
    children,
    title,
    footer,
  }: React.PropsWithChildren<{ visible?: boolean; title?: React.ReactNode; footer?: React.ReactNode }>) =>
    visible ? (
      <div role='dialog'>
        {title && <div>{title}</div>}
        {children}
        {footer}
      </div>
    ) : null,
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Result: ({ title, subTitle }: { title?: React.ReactNode; subTitle?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      <div>{subTitle}</div>
    </div>
  ),
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import SuperAssistantPage from '@/renderer/pages/superAssistant';

describe('SuperAssistantPage (refactored command center)', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    ensureSessionMock.mockReset();
    sendMessageToAgentMock.mockReset();
    updateRequirementMock.mockReset();
    listTeamTasksMock.mockReset();
    createTeamTaskMock.mockReset();
    updateTeamTaskMock.mockReset();
    deleteTeamTaskMock.mockReset();
    teamRuntimeState.agentStatusListener = null;
    locationMock.pathname = '/super-assistant';
    locationMock.search = '';
    requirementTreeState.items = [
      {
        id: 'epic-1',
        type: 'epic',
        subject: '企业工作台升级',
        status: 'planning',
        priority: 'high',
        assigned_to: null,
        creator_id: 'user-1',
        tenant_id: 'tenant-1',
        created_at: 1,
        updated_at: 10,
        children: [
          {
            id: 'story-1',
            type: 'story',
            subject: '修复团队上下文深链',
            description: '让团队路由在共享工作台完整往返',
            status: 'developing',
            priority: 'urgent',
            assigned_to: 'user-1',
            creator_id: 'user-1',
            tenant_id: 'tenant-1',
            created_at: 2,
            updated_at: 20,
          },
          {
            id: 'story-2',
            type: 'story',
            subject: '补齐超级助手数据接入',
            description: null,
            status: 'backlog',
            priority: 'high',
            assigned_to: 'user-1',
            creator_id: 'user-1',
            tenant_id: 'tenant-1',
            created_at: 3,
            updated_at: 18,
          },
        ],
      },
    ];
    listRequirementsTreeMock.mockImplementation(async () => structuredClone(requirementTreeState.items));
    updateRequirementMock.mockImplementation(async (requirementId: string, payload: { status?: string }) => {
      const nextStatus = payload.status;
      if (!nextStatus) return;
      const updateNode = (items: Array<Record<string, unknown>>): boolean => {
        for (const item of items) {
          if (item.id === requirementId) {
            item.status = nextStatus;
            return true;
          }
          const children = Array.isArray(item.children) ? (item.children as Array<Record<string, unknown>>) : [];
          if (children.length && updateNode(children)) return true;
        }
        return false;
      };
      updateNode(requirementTreeState.items);
    });
    teamTaskState.items = [];
    listTeamTasksMock.mockImplementation(async (teamId: string) =>
      structuredClone(teamTaskState.items.filter((item) => item.team_id === teamId))
    );
    createTeamTaskMock.mockImplementation(
      async (payload: {
        teamId: string;
        subject: string;
        description?: string | null;
        owner?: string | null;
        metadata?: Record<string, unknown>;
      }) => {
        teamTaskState.items.push({
          id: `teamtask-${teamTaskState.items.length + 1}`,
          team_id: payload.teamId,
          subject: payload.subject,
          description: payload.description ?? null,
          status: 'in_progress',
          owner: payload.owner ?? null,
          metadata: payload.metadata ?? {},
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    );
    updateTeamTaskMock.mockImplementation(async (taskId: string, payload: { metadata?: Record<string, unknown> }) => {
      const task = teamTaskState.items.find((item) => item.id === taskId);
      if (!task) return;
      if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
        task.metadata = payload.metadata ?? {};
      }
    });
    deleteTeamTaskMock.mockImplementation(async (taskId: string) => {
      teamTaskState.items = teamTaskState.items.filter((item) => item.id !== taskId);
    });
    listSkillsMock.mockResolvedValue([
      { id: 'skill-1', name: 'PR Review' },
      { id: 'skill-2', name: 'Deploy Bot' },
    ]);
    listMcpRegistryMock.mockResolvedValue([
      { id: 'mcp-1', name: 'GitHub Actions', enabled: true },
      { id: 'mcp-2', name: 'Local Runner', enabled: false },
    ]);
    listRagDocumentsMock.mockResolvedValue([
      { id: 'rag-1', title: '研发规范', chunk_count: 8 },
      { id: 'rag-2', title: '交付流程', chunk_count: 12 },
    ]);
    listCodeReposMock.mockResolvedValue([{ id: 'repo-1', name: '1one-command' }]);
    listPipelinesMock.mockResolvedValue([{ id: 'pipe-1', name: 'Release Pipeline' }]);
    useTeamListMock.mockReturnValue({
      teams: [
        {
          id: 'team-1',
          name: 'Alpha Team',
          workspace: '/repo/alpha',
          agents: [
            { slotId: 'leader', role: 'lead', agentType: 'super', agentName: '超级助手 Leader', conversationType: 'gemini', status: 'active' },
            { slotId: 'dev', role: 'teammate', agentType: 'dev', agentName: '开发 Agent', conversationType: 'codex', status: 'idle' },
          ],
        },
      ],
      mutate: vi.fn(),
      removeTeam: vi.fn(),
    });
    conversationHistoryMock.mockReturnValue({
      groupedHistory: { timelineSections: [] },
      conversations: [
        { id: 'conv-team-1', extra: { teamId: 'team-1' } },
        { id: 'conv-team-2', extra: { teamId: 'team-1' } },
      ],
    });
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      tenantLabel: '欢乐互娱有限公司',
      showEnterpriseAdminNav: true,
    });
    authMock.mockReturnValue({
      user: { id: 'user-1', role: 'org_admin' },
    });
  });

  it('renders refactored single-page command center', async () => {
    render(<SuperAssistantPage />);
    expect(screen.getByText('超级助手 / 企业 Agent 工作台')).toBeInTheDocument();
    expect(screen.getByText('任务指挥中心')).toBeInTheDocument();
    expect(screen.getByText('实时执行面板')).toBeInTheDocument();
    expect(screen.getByText('能力沉淀与运行时')).toBeInTheDocument();
    expect(await screen.findByText('共享 Issue 看板')).toBeInTheDocument();
  });

  it('assigns issue to agent from command panel', async () => {
    render(<SuperAssistantPage />);
    fireEvent.click(await screen.findByRole('button', { name: '开发 Agent' }));
    await waitFor(() => {
      expect(createTeamTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', owner: 'dev' })
      );
      expect(ensureSessionMock).toHaveBeenCalledWith({ teamId: 'team-1' });
      expect(sendMessageToAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', slotId: 'dev' })
      );
    });
  });

  it('marks and clears blocker for assigned issue', async () => {
    render(<SuperAssistantPage />);
    fireEvent.click(await screen.findByRole('button', { name: '开发 Agent' }));
    fireEvent.click(await screen.findByRole('button', { name: '标记阻塞' }));
    await waitFor(() => {
      expect(updateTeamTaskMock).toHaveBeenCalledWith(
        'teamtask-1',
        expect.objectContaining({
          metadata: expect.objectContaining({ manualStatus: 'failed' }),
        })
      );
    });
    fireEvent.click(screen.getByRole('button', { name: '解除阻塞' }));
    await waitFor(() => {
      expect(updateTeamTaskMock).toHaveBeenCalledWith(
        'teamtask-1',
        expect.objectContaining({
          metadata: expect.objectContaining({ manualStatus: 'idle' }),
        })
      );
    });
  });

  it('moves issue to completed', async () => {
    render(<SuperAssistantPage />);
    fireEvent.click(await screen.findByRole('button', { name: '标记完成' }));
    await waitFor(() => {
      expect(updateRequirementMock).toHaveBeenCalledWith('story-1', { status: 'completed' });
    });
  });

  it('opens shared session and ensures team session first', async () => {
    render(<SuperAssistantPage />);
    fireEvent.click((await screen.findAllByText('修复团队上下文深链'))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '共享会话' }));
    await waitFor(() => {
      expect(ensureSessionMock).toHaveBeenCalledWith({ teamId: 'team-1' });
    });
    expect(navigateMock).toHaveBeenCalled();
  });

  it('shows runtime failure feedback in live execution panel', async () => {
    render(<SuperAssistantPage />);
    expect(await screen.findByText('Alpha Team')).toBeInTheDocument();
    teamRuntimeState.agentStatusListener?.({
      teamId: 'team-1',
      slotId: 'dev',
      status: 'failed',
      lastMessage: '等待 GitHub Actions 结果超时',
    });
    expect((await screen.findAllByText('已阻塞')).length).toBeGreaterThan(0);
  });

  it('renders member collaboration tag for non-admin users', async () => {
    authMock.mockReturnValue({ user: { id: 'user-1', role: 'member' } });
    render(<SuperAssistantPage />);
    expect(await screen.findByText('协作视图')).toBeInTheDocument();
  });

  it('renders empty state when there are no teams and issues', async () => {
    listRequirementsTreeMock.mockResolvedValue([]);
    useTeamListMock.mockReturnValue({ teams: [], mutate: vi.fn(), removeTeam: vi.fn() });
    render(<SuperAssistantPage />);
    expect((await screen.findAllByText('暂无共享 Issue')).length).toBeGreaterThan(0);
    expect(screen.getByText('还没有团队')).toBeInTheDocument();
  });
});
