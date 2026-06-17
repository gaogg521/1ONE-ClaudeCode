import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const conversationHistoryMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const openEnterpriseAdminInBrowserMock = vi.hoisted(() => vi.fn());
const openAdminConsoleMock = vi.hoisted(() => vi.fn());
const readPinnedProjectsMock = vi.hoisted(() => vi.fn(() => []));

function buildEditionFeatures(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const merged = {
    hasJoinedEnterprise: false,
    hasInstanceEnterprise: false,
    showEnterpriseAdminNav: false,
    showTeamsFeature: false,
    tenantLabel: null,
    ...overrides,
  };
  return {
    ...merged,
    showEnterpriseWorkspaceHub:
      overrides.showEnterpriseWorkspaceHub ??
      Boolean(merged.hasJoinedEnterprise || merged.hasInstanceEnterprise || merged.showEnterpriseAdminNav),
  };
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; tenant?: string }) =>
      options?.defaultValue?.replace('{{tenant}}', options?.tenant ?? '') || _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <section onClick={onClick}>{children}</section>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Typography: {
    Ellipsis: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => conversationHistoryMock(),
}));

vi.mock('@/renderer/utils/workspace/pinnedProjects', () => ({
  readPinnedProjects: readPinnedProjectsMock,
  getProjectDisplayName: (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path,
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({
    openEnterpriseAdminInBrowser: openEnterpriseAdminInBrowserMock,
  }),
}));

vi.mock('@/renderer/utils/openAdminConsole', () => ({
  openAdminConsole: (...args: unknown[]) => openAdminConsoleMock(...args),
}));

import WorkspacePage from '@/renderer/pages/workspace';

describe('WorkspacePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    readPinnedProjectsMock.mockReset();
    readPinnedProjectsMock.mockReturnValue([]);
    window.sessionStorage.clear();
    conversationHistoryMock.mockReturnValue({
      groupedHistory: { timelineSections: [] },
      conversations: [],
    });
    editionFeaturesMock.mockReturnValue(buildEditionFeatures());
    authMock.mockReturnValue({
      status: 'authenticated',
      user: { id: 'user-1', role: 'org_admin' },
    });
    openEnterpriseAdminInBrowserMock.mockReset();
    openEnterpriseAdminInBrowserMock.mockResolvedValue('opened');
    openAdminConsoleMock.mockReset();
    openAdminConsoleMock.mockResolvedValue('navigated');
  });

  it('shows enterprise collaboration shortcuts inside the main workspace after joining an enterprise', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        showTeamsFeature: true,
        tenantLabel: '欢乐互娱有限公司',
      })
    );

    render(<WorkspacePage />);

    expect(screen.getByTestId('page-content-shell-content')).toBeInTheDocument();
    expect(screen.getByText('企业协同与平台能力')).toBeInTheDocument();
    expect(screen.getByText('企业能力总览')).toBeInTheDocument();
    expect(screen.getByText('敏捷 Issues')).toBeInTheDocument();
    expect(screen.getByText('共享会话')).toBeInTheDocument();
    expect(screen.getByText('共享任务')).toBeInTheDocument();
    expect(screen.getByText('CCI 流水线')).toBeInTheDocument();
    expect(screen.getByText('Agent 助手')).toBeInTheDocument();
    expect(screen.getByText('组织管理后台')).toBeInTheDocument();
  });

  it('navigates to shared sessions and tasks scopes from the workspace enterprise cards', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        showTeamsFeature: true,
        tenantLabel: '欢乐互娱有限公司',
      })
    );

    render(<WorkspacePage />);

    const sharedSessionsCard = screen.getByText('共享会话').closest('section');
    const sharedTasksCard = screen.getByText('共享任务').closest('section');

    if (!sharedSessionsCard || !sharedTasksCard) {
      throw new Error('Expected shared workspace enterprise cards to render');
    }

    fireEvent.click(within(sharedSessionsCard).getByText('进入'));
    fireEvent.click(within(sharedTasksCard).getByText('进入'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/sessions?scope=team');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/tasks?scope=team');
  });

  it('prefers the latest active team scope for shared workspace enterprise cards', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        showTeamsFeature: true,
        tenantLabel: '欢乐互娱有限公司',
      })
    );
    window.sessionStorage.setItem(
      'workspace:last-active-team-scope',
      JSON.stringify({ teamId: 'team-1', teamName: 'Alpha Team' })
    );

    render(<WorkspacePage />);

    const sharedSessionsCard = screen.getByText('共享会话').closest('section');
    const sharedTasksCard = screen.getByText('共享任务').closest('section');

    if (!sharedSessionsCard || !sharedTasksCard) {
      throw new Error('Expected shared workspace enterprise cards to render');
    }

    fireEvent.click(within(sharedSessionsCard).getByText('进入'));
    fireEvent.click(within(sharedTasksCard).getByText('进入'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/sessions?scope=team&teamId=team-1&teamName=Alpha+Team');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/tasks?scope=team&teamId=team-1&teamName=Alpha+Team');
  });

  it('opens recent workspaces through TeamPage when the latest conversation belongs to a team', () => {
    conversationHistoryMock.mockReturnValue({
      groupedHistory: {
        timelineSections: [
          {
            timeline: '今天',
            items: [
              {
                type: 'workspace',
                time: 1710000000000,
                workspaceGroup: {
                  workspace: '/repo/team-alpha',
                  displayName: 'Alpha Repo',
                  conversations: [
                    {
                      id: 'conversation-team',
                      name: '团队协同会话',
                      extra: { workspace: '/repo/team-alpha', customWorkspace: true, teamId: 'team-1' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      conversations: [],
    });

    render(<WorkspacePage />);

    fireEvent.click(screen.getByText('Alpha Repo'));
    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');
  });

  it('shows pinned project folders even without conversation history', () => {
    readPinnedProjectsMock.mockReturnValue(['/repo/demo-project']);

    render(<WorkspacePage />);

    expect(screen.getByText('demo-project')).toBeInTheDocument();
    expect(screen.queryByText('暂无工作区记录')).not.toBeInTheDocument();
  });

  it('opens guid with workspace when clicking a pinned project without sessions', () => {
    readPinnedProjectsMock.mockReturnValue(['/repo/demo-project']);

    render(<WorkspacePage />);
    fireEvent.click(screen.getByText('demo-project'));

    expect(navigateMock).toHaveBeenCalledWith('/guid', { state: { workspace: '/repo/demo-project' } });
  });

  it('keeps the workspace page clean when the user has not joined an enterprise', () => {
    render(<WorkspacePage />);

    expect(screen.queryByText('企业协同与平台能力')).not.toBeInTheDocument();
  });

  it('hides the admin-only CCI entry for enterprise members without admin navigation', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: false,
        tenantLabel: '欢乐互娱有限公司',
      })
    );

    render(<WorkspacePage />);

    expect(screen.queryByText('CCI 流水线')).not.toBeInTheDocument();
  });

  it('makes the CCI enterprise card clickable as a whole for admins', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        tenantLabel: '欢乐互娱有限公司',
      })
    );

    render(<WorkspacePage />);

    const cciCard = screen.getByText('CCI 流水线').closest('section');
    if (!cciCard) {
      throw new Error('Expected CCI card to render');
    }

    fireEvent.click(cciCard);

    expect(navigateMock).toHaveBeenCalledWith('/enterprise/pipeline-editor');
  });

  it('shows the four-card personal workspace hub for joined enterprise admins without team collaboration', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        showTeamsFeature: false,
        tenantLabel: '上海欢乐互娱网络科技有限公司',
      })
    );

    render(<WorkspacePage />);

    expect(screen.getByText('敏捷 Issues')).toBeInTheDocument();
    expect(screen.getByText('Agent 助手')).toBeInTheDocument();
    expect(screen.getByText('组织管理后台')).toBeInTheDocument();
    expect(screen.getByText('CCI 流水线')).toBeInTheDocument();
    expect(screen.queryByText('企业能力总览')).not.toBeInTheDocument();
    expect(screen.queryByText('共享会话')).not.toBeInTheDocument();
  });

  it('navigates core enterprise cards to issues, assistant, and pipeline routes', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        showTeamsFeature: false,
        tenantLabel: '上海欢乐互娱网络科技有限公司',
      })
    );

    render(<WorkspacePage />);

    fireEvent.click(within(screen.getByText('敏捷 Issues').closest('section')!).getByText('进入'));
    fireEvent.click(within(screen.getByText('Agent 助手').closest('section')!).getByText('进入'));
    fireEvent.click(within(screen.getByText('CCI 流水线').closest('section')!).getByText('进入'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/issues');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/super-assistant?tab=overview');
    expect(navigateMock).toHaveBeenNthCalledWith(3, '/enterprise/pipeline-editor');
  });

  it('opens the admin console through the shared admin entry helper', () => {
    editionFeaturesMock.mockReturnValue(
      buildEditionFeatures({
        hasJoinedEnterprise: true,
        showEnterpriseAdminNav: true,
        showTeamsFeature: false,
        tenantLabel: '上海欢乐互娱网络科技有限公司',
      })
    );

    render(<WorkspacePage />);

    fireEvent.click(within(screen.getByText('组织管理后台').closest('section')!).getByText('进入'));

    expect(openAdminConsoleMock).toHaveBeenCalledWith({
      navigate: expect.any(Function),
      openEnterpriseAdminInBrowser: openEnterpriseAdminInBrowserMock,
    });
    expect(navigateMock).not.toHaveBeenCalledWith('/enterprise/auth');
  });
});
