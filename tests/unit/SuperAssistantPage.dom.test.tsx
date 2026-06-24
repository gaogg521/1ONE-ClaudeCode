import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editionFeaturesMock = vi.hoisted(() => vi.fn());
const webuiEnterpriseModeMock = vi.hoisted(() => vi.fn());
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
const runDigitalEmployeeNowMock = vi.hoisted(() => vi.fn());
const personalAgentRunNowMock = vi.hoisted(() => vi.fn());
const createConversationMock = vi.hoisted(() => vi.fn());
const buildCliAgentParamsMock = vi.hoisted(() => vi.fn());
const requirementTreeState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
}));
const teamTaskState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
}));
const teamRuntimeState = vi.hoisted(() => ({
  agentStatusListener: null as null | ((event: { teamId: string; slotId: string; status: string; lastMessage?: string }) => void),
}));
const isElectronDesktopMock = vi.hoisted(() => vi.fn(() => false));

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
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobs: {
        invoke: vi.fn().mockResolvedValue([]),
      },
      runNow: {
        invoke: vi.fn().mockResolvedValue({}),
      },
      updateJob: {
        invoke: vi.fn().mockResolvedValue({}),
      },
      removeJob: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      onJobCreated: {
        on: vi.fn(() => vi.fn()),
      },
      onJobUpdated: {
        on: vi.fn(() => vi.fn()),
      },
      onJobRemoved: {
        on: vi.fn(() => vi.fn()),
      },
    },
    conversation: {
      create: {
        invoke: createConversationMock,
      },
    },
    team: {
      ensureSession: {
        invoke: ensureSessionMock,
      },
      sendMessageToAgent: {
        invoke: sendMessageToAgentMock,
      },
      runDigitalEmployeeNow: {
        invoke: runDigitalEmployeeNowMock,
      },
      get: {
        invoke: vi.fn().mockResolvedValue(null),
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
    personalAgent: {
      list: {
        invoke: vi.fn().mockResolvedValue([]),
      },
      create: {
        invoke: vi.fn().mockResolvedValue({}),
      },
      update: {
        invoke: vi.fn().mockResolvedValue({}),
      },
      get: {
        invoke: vi.fn().mockResolvedValue(null),
      },
      runNow: {
        invoke: personalAgentRunNowMock,
      },
    },
  },
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => webuiEnterpriseModeMock(),
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

vi.mock('@/renderer/pages/conversation/utils/createConversationParams', () => ({
  buildCliAgentParams: (...args: unknown[]) => buildCliAgentParamsMock(...args),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => isElectronDesktopMock(),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    visible,
    children,
    header,
    footer,
  }: React.PropsWithChildren<{ visible?: boolean; header?: React.ReactNode; footer?: React.ReactNode }>) =>
    visible ? (
      <div role='dialog'>
        {header ? <div>{header}</div> : null}
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    loading: _loading,
    ...props
  }: React.PropsWithChildren<Record<string, unknown> & { onClick?: () => void; loading?: boolean }>) => (
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
    onOk,
    okText,
  }: React.PropsWithChildren<{
    visible?: boolean;
    title?: React.ReactNode;
    footer?: React.ReactNode;
    onOk?: () => void;
    okText?: React.ReactNode;
  }>) =>
    visible ? (
      <div role='dialog'>
        {title && <div>{title}</div>}
        {children}
        {footer}
        {onOk ? <button onClick={() => void onOk()}>{okText ?? 'OK'}</button> : null}
      </div>
    ) : null,
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Alert: ({ content }: { content?: React.ReactNode }) => <div role='alert'>{content}</div>,
  Popconfirm: ({
    children,
    onOk,
  }: React.PropsWithChildren<{ onOk?: () => void }>) => (
    <div data-testid='popconfirm' onClick={() => void onOk?.()}>
      {children}
    </div>
  ),
  Timeline: Object.assign(
    ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    { Item: ({ children, label }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
      <div>
        {label}
        {children}
      </div>
    ) }
  ),
  Spin: ({ children }: React.PropsWithChildren<{ loading?: boolean }>) => <div>{children}</div>,
  Input: Object.assign(
    ({
      value,
      onChange,
      placeholder,
    }: {
      value?: string;
      onChange?: (value: string) => void;
      placeholder?: string;
    }) => <input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} />,
    {
      TextArea: ({
        value,
        onChange,
        placeholder,
      }: {
        value?: string;
        onChange?: (value: string) => void;
        placeholder?: string;
      }) => <textarea value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} />,
    }
  ),
  Select: Object.assign(
    ({
      children,
      value,
      onChange,
    }: React.PropsWithChildren<{ value?: string; onChange?: (value: string) => void }>) => (
      <select value={value} onChange={(event) => onChange?.(event.target.value)}>
        {children}
      </select>
    ),
    {
      Option: ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
        <option value={value}>{children}</option>
      ),
    }
  ),
  Radio: Object.assign(
    ({ children, value, disabled }: React.PropsWithChildren<{ value?: string; disabled?: boolean }>) => (
      <label>
        <input type='radio' value={value} disabled={disabled} />
        {children}
      </label>
    ),
    {
      Group: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    }
  ),
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
import { ipcBridge } from '@/common';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';

describe('SuperAssistantPage (refactored command center)', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    ensureSessionMock.mockReset();
    sendMessageToAgentMock.mockReset();
    createConversationMock.mockReset();
    buildCliAgentParamsMock.mockReset();
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
    vi.mocked(ipcBridge.personalAgent.list.invoke).mockResolvedValue([]);
    createConversationMock.mockResolvedValue({ id: 'conv-personal-agent' });
    buildCliAgentParamsMock.mockResolvedValue({
      type: 'acp',
      name: '个人 Agent',
      model: {},
      extra: { workspace: '', backend: 'codex', agentName: '个人 Agent' },
    });
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
      showTeamsFeature: true,
      identity: { userId: 'user-1', tenantId: 'default' },
      can: () => false,
    });
    personalAgentRunNowMock.mockResolvedValue({
      runId: 'run-personal',
      conversationId: 'conv-personal-agent',
    });
    runDigitalEmployeeNowMock.mockResolvedValue({
      runId: 'run-team',
      conversationId: 'conv-team-dev',
    });
    webuiEnterpriseModeMock.mockReturnValue({
      openEnterpriseAdminInBrowser: vi.fn(),
    });
    authMock.mockReturnValue({
      user: { id: 'user-1', role: 'org_admin' },
    });
  });

  it('renders refactored single-page command center', async () => {
    render(<SuperAssistantPage />);
    expect(screen.getByText('Agent 助手 / Issue 工作台')).toBeInTheDocument();
    expect(screen.getByText('工作台')).toBeInTheDocument();
    expect(await screen.findByText('当前 Issue 工作台')).toBeInTheDocument();
    expect(screen.getByText('最近运行 / 执行反馈')).toBeInTheDocument();
  });

  it('uses desktop operator identity for local personal resources when not logged in', async () => {
    authMock.mockReturnValue({ user: null });
    requirementTreeState.items = [
      {
        id: 'story-local',
        type: 'story',
        subject: '本地个人 Issue',
        description: 'local issue',
        status: 'backlog',
        priority: 'medium',
        assigned_to: null,
        creator_id: DESKTOP_OPERATOR_USER_ID,
        tenant_id: 'default',
        created_at: 1,
        updated_at: 1,
      },
    ];

    render(<SuperAssistantPage />);

    await waitFor(() => {
      expect(ipcBridge.personalAgent.list.invoke).toHaveBeenCalledWith({
        ownerUserId: DESKTOP_OPERATOR_USER_ID,
      });
    });
    expect(await screen.findAllByText('本地个人 Issue')).not.toHaveLength(0);
  });

  it('runs personal agents in background via personalAgent.runNow without navigating to chat', async () => {
    vi.mocked(ipcBridge.personalAgent.list.invoke).mockResolvedValue([
      {
        id: 'personal-agent-1',
        ownerUserId: 'user-1',
        tenantId: 'default',
        name: '个人执行 Agent',
        description: 'personal',
        agentType: 'codex',
        conversationType: 'acp',
        automationConfig: {},
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    locationMock.search = '?tab=agents';
    render(<SuperAssistantPage />);
    const editButtons = await screen.findAllByRole('button', { name: '编辑' });
    ensureSessionMock.mockClear();
    sendMessageToAgentMock.mockClear();
    fireEvent.click(editButtons[0]!);
    const runButtons = await screen.findAllByRole('button', { name: '立即执行' });
    fireEvent.click(runButtons[0]!);
    // 重构后「立即执行」先弹任务描述输入框，需点「运行」确认才真正运行。
    fireEvent.click(await screen.findByRole('button', { name: '运行' }));

    await waitFor(() => {
      expect(personalAgentRunNowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'personal-agent-1',
          ownerUserId: 'user-1',
        })
      );
    });
    expect(ensureSessionMock).not.toHaveBeenCalled();
    expect(sendMessageToAgentMock).not.toHaveBeenCalled();
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith('/conversation/conv-personal-agent');
  });

  it('runs workspace agents in background via team.runDigitalEmployeeNow without navigating', async () => {
    locationMock.search = '?tab=agents';
    render(<SuperAssistantPage />);
    const runButtons = await screen.findAllByRole('button', { name: '立即执行' });
    personalAgentRunNowMock.mockClear();
    runDigitalEmployeeNowMock.mockClear();
    navigateMock.mockClear();
    fireEvent.click(runButtons[1]!);
    fireEvent.click(await screen.findByRole('button', { name: '运行' }));

    await waitFor(() => {
      expect(runDigitalEmployeeNowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-1',
          slotId: 'dev',
        })
      );
    });
    expect(personalAgentRunNowMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('assigns issue to agent from command panel', async () => {
    locationMock.search = '?tab=issues';
    render(<SuperAssistantPage />);
    fireEvent.click(await screen.findByRole('button', { name: '开发 Agent' }));
    await waitFor(() => {
      expect(createTeamTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', owner: 'dev' })
      );
      expect(ensureSessionMock).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1' }));
      expect(sendMessageToAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', slotId: 'dev' })
      );
    });
  });

  it('marks and clears blocker for assigned issue', async () => {
    locationMock.search = '?tab=issues';
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
    locationMock.search = '?tab=issues';
    render(<SuperAssistantPage />);
    fireEvent.click(await screen.findByRole('button', { name: '标记完成' }));
    await waitFor(() => {
      expect(updateRequirementMock).toHaveBeenCalledWith('story-1', { status: 'completed' });
    });
  });

  it('opens shared session and ensures team session first', async () => {
    locationMock.search = '?tab=issues';
    render(<SuperAssistantPage />);
    fireEvent.click((await screen.findAllByText('修复团队上下文深链'))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '共享会话' }));
    await waitFor(() => {
      expect(ensureSessionMock).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1' }));
    });
    expect(navigateMock).toHaveBeenCalled();
  });

  it('shows runtime failure feedback on agents tab', async () => {
    locationMock.search = '?tab=agents';
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

  it('switches internal tabs immediately and updates the route', async () => {
    isElectronDesktopMock.mockReturnValue(false);
    locationMock.search = '?tab=overview';
    render(<SuperAssistantPage />);
    fireEvent.click(await screen.findByRole('button', { name: '数字员工' }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/super-assistant?tab=agents&issueId=story-1', { replace: true });
    });
  });

  it('renders empty state when there are no teams and issues', async () => {
    listRequirementsTreeMock.mockResolvedValue([]);
    useTeamListMock.mockReturnValue({ teams: [], mutate: vi.fn(), removeTeam: vi.fn() });
    render(<SuperAssistantPage />);
    expect(
      await screen.findByText('还没有数字员工。个人版可直接创建；加入协同团队后可创建工作区数字员工。')
    ).toBeInTheDocument();
    cleanup();
    locationMock.search = '?tab=agents';
    render(<SuperAssistantPage />);
    expect(
      await screen.findByText('还没有数字员工。个人版可直接创建；加入协同团队后可创建工作区数字员工。')
    ).toBeInTheDocument();
  });

  it('auto-starts personal issue handling without redirecting to enterprise console', async () => {
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: false,
      tenantLabel: null,
      showEnterpriseAdminNav: false,
      showTeamsFeature: false,
      identity: { userId: 'user-1', tenantId: 'default' },
      can: () => false,
    });
    requirementTreeState.items = [
      {
        id: 'issue-personal-1',
        type: 'story',
        subject: '个人 Issue 自动处理',
        description: 'auto start',
        status: 'backlog',
        priority: 'medium',
        assigned_to: 'user-1',
        creator_id: 'user-1',
        tenant_id: 'default',
        created_at: 1,
        updated_at: 1,
      },
    ];
    vi.mocked(ipcBridge.personalAgent.list.invoke).mockResolvedValue([
      {
        id: 'personal-agent-1',
        ownerUserId: 'user-1',
        tenantId: 'default',
        name: '个人执行 Agent',
        description: 'personal',
        agentType: 'codex',
        conversationType: 'acp',
        automationConfig: {},
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    locationMock.search = '?issueId=issue-personal-1&tab=overview&action=start';
    navigateMock.mockClear();
    personalAgentRunNowMock.mockClear();

    render(<SuperAssistantPage />);

    // 重构后 auto-start 也走统一的「任务输入框」流程：弹框 → 点「运行」确认才执行。
    // 注意：当前实现下 issue context 不再从 URL 自动透传（用户在框里输入任务），
    // 故此处只校验 agentId 与「不跳企业后台」，不再断言 issue=issue-personal-1。
    fireEvent.click(await screen.findByRole('button', { name: '运行' }));

    await waitFor(() => {
      expect(personalAgentRunNowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'personal-agent-1',
        })
      );
    });
    expect(navigateMock).not.toHaveBeenCalledWith('/enterprise');
    expect(navigateMock).not.toHaveBeenCalledWith('/enterprise/teams');
  });
});
