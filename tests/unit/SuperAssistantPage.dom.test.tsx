import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editionFeaturesMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const listRequirementsTreeMock = vi.hoisted(() => vi.fn());
const listSkillsMock = vi.hoisted(() => vi.fn());
const listMcpRegistryMock = vi.hoisted(() => vi.fn());
const useTeamListMock = vi.hoisted(() => vi.fn());
const conversationHistoryMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ pathname: '/super-assistant', search: '' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: {
        defaultValue?: string;
        tenant?: string;
        count?: number | string;
        subject?: string;
        agentCount?: number | string;
        activeCount?: number | string;
      }
    ) =>
      options?.defaultValue
        ?.replace('{{tenant}}', options?.tenant ?? '')
        .replace('{{count}}', String(options?.count ?? ''))
        .replace('{{subject}}', options?.subject ?? '')
        .replace('{{agentCount}}', String(options?.agentCount ?? ''))
        .replace('{{activeCount}}', String(options?.activeCount ?? '')) || _key,
  }),
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
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => useTeamListMock(),
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => conversationHistoryMock(),
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
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Result: ({ title, subTitle }: { title?: React.ReactNode; subTitle?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      <div>{subTitle}</div>
    </div>
  ),
}));

import SuperAssistantPage from '@/renderer/pages/superAssistant';

describe('SuperAssistantPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    locationMock.pathname = '/super-assistant';
    locationMock.search = '';
    listRequirementsTreeMock.mockResolvedValue([
      {
        id: 'epic-1',
        type: 'epic',
        subject: '企业工作台升级',
        description: null,
        status: 'planning',
        priority: 'high',
        assigned_to: null,
        creator_id: 'user-1',
        tenant_id: 'tenant-1',
        parent_id: null,
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
            parent_id: 'epic-1',
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
            parent_id: 'epic-1',
            created_at: 3,
            updated_at: 18,
          },
        ],
      },
    ]);
    listSkillsMock.mockResolvedValue([
      {
        id: 'skill-1',
        name: 'PR Review',
        description: 'Review pull request quality',
        content: '...',
        enabled: 1,
        scope: 'org',
        team_id: null,
        created_by: 'user-1',
        created_at: 1,
        updated_at: 2,
      },
      {
        id: 'skill-2',
        name: 'Deploy Bot',
        description: 'Deploy and verify changes',
        content: '...',
        enabled: 1,
        scope: 'team',
        team_id: 'team-1',
        created_by: 'user-1',
        created_at: 1,
        updated_at: 2,
      },
    ]);
    listMcpRegistryMock.mockResolvedValue([
      {
        id: 'mcp-1',
        name: 'GitHub Actions',
        type: 'sse',
        endpoint: 'https://mcp.example/github',
        enabled: true,
        hasKeys: true,
      },
      {
        id: 'mcp-2',
        name: 'Local Runner',
        type: 'stdio',
        endpoint: 'runner',
        enabled: false,
        hasKeys: false,
      },
    ]);
    useTeamListMock.mockReturnValue({
      teams: [
        {
          id: 'team-1',
          name: 'Alpha Team',
          workspace: '/repo/alpha',
          agents: [
            { slotId: 'leader', conversationId: 'conv-1', role: 'lead', agentType: 'super', agentName: '超级助手 Leader', conversationType: 'gemini', status: 'active' },
            { slotId: 'dev', conversationId: 'conv-2', role: 'teammate', agentType: 'dev', agentName: '开发 Agent', conversationType: 'codex', status: 'idle' },
          ],
          userId: 'user-1',
          workspaceMode: 'shared',
          leadAgentId: 'leader',
          createdAt: 1,
          updatedAt: 2,
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

  it('renders the issues workbench with live requirement data by default for joined enterprise members', async () => {
    render(<SuperAssistantPage />);

    expect(screen.getByText('超级助手')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('共享 Issue 看板')).toBeInTheDocument();
    expect((await screen.findAllByText('修复团队上下文深链')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 个 Issue').length).toBeGreaterThan(0);
  });

  it('renders agent squad content with live team data when switching to the Agents tab', async () => {
    render(<SuperAssistantPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Agents' }));

    expect(await screen.findByText('Alpha Team')).toBeInTheDocument();
    expect(screen.getByText('2 个协作 Agent')).toBeInTheDocument();
  });

  it('shows a live admin overview summary when switching to the overview tab', async () => {
    render(<SuperAssistantPage />);

    fireEvent.click(screen.getByRole('tab', { name: '总览' }));

    expect(await screen.findByText('当前共有 2 个未完成 Issue')).toBeInTheDocument();
  });

  it('shows a member-scoped overview when the user is not an admin', async () => {
    authMock.mockReturnValue({
      user: { id: 'user-1', role: 'member' },
    });

    render(<SuperAssistantPage />);

    fireEvent.click(screen.getByRole('tab', { name: '总览' }));

    expect(screen.getByText('我参与的协作')).toBeInTheDocument();
    expect(await screen.findByText('我当前参与 2 个 Issue')).toBeInTheDocument();
  });

  it('deep-links to current team scoped collaboration modules from the command panel', async () => {
    render(<SuperAssistantPage />);

    expect((await screen.findAllByText('修复团队上下文深链')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('拆解当前 Issue'));
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/enterprise/cteam?teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );

    fireEvent.click(screen.getByText('创建共享任务'));
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/tasks?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );

    fireEvent.click(screen.getByText('创建共享会话'));
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/sessions?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
  });

  it('switches the current issue activity flow when selecting another live issue', async () => {
    render(<SuperAssistantPage />);

    expect((await screen.findAllByText('当前处理：修复团队上下文深链')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '补齐超级助手数据接入' }));

    expect((await screen.findAllByText('当前处理：补齐超级助手数据接入')).length).toBeGreaterThan(0);
  });

  it('restores the current issue from query params when returning from cteam', async () => {
    locationMock.search = '?tab=issues&issueId=story-2';

    render(<SuperAssistantPage />);

    expect((await screen.findAllByText('当前处理：补齐超级助手数据接入')).length).toBeGreaterThan(0);
  });

  it('shows live skill and mcp summaries in the Skills tab', async () => {
    render(<SuperAssistantPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));

    expect(await screen.findByText('已接入 2 个技能')).toBeInTheDocument();
    expect(screen.getByText(/GitHub Actions/)).toBeInTheDocument();
  });

  it('shows live runtime summaries in the Runtimes tab', async () => {
    render(<SuperAssistantPage />);

    fireEvent.click(screen.getByRole('tab', { name: '运行时' }));

    expect(await screen.findByText('当前有 2 个 Agent、1 个活跃 Agent')).toBeInTheDocument();
    expect(screen.getByText('当前有 1 个启用中的 MCP 连接器')).toBeInTheDocument();
  });

  it('shows empty-state summaries when there are no shared issues or teams', async () => {
    listRequirementsTreeMock.mockResolvedValue([]);
    listSkillsMock.mockResolvedValue([]);
    listMcpRegistryMock.mockResolvedValue([]);
    useTeamListMock.mockReturnValue({
      teams: [],
      mutate: vi.fn(),
      removeTeam: vi.fn(),
    });
    conversationHistoryMock.mockReturnValue({
      groupedHistory: { timelineSections: [] },
      conversations: [],
    });

    render(<SuperAssistantPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无共享 Issue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Agents' }));
    expect(screen.getByText('还没有团队')).toBeInTheDocument();
  });
});
