import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const conversationHistoryMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());

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
  Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Typography: {
    Ellipsis: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => conversationHistoryMock(),
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

import WorkspacePage from '@/renderer/pages/workspace';

describe('WorkspacePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    window.sessionStorage.clear();
    conversationHistoryMock.mockReturnValue({
      groupedHistory: { timelineSections: [] },
      conversations: [],
    });
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: false,
      showEnterpriseAdminNav: false,
      tenantLabel: null,
    });
  });

  it('shows enterprise collaboration shortcuts inside the main workspace after joining an enterprise', () => {
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      showEnterpriseAdminNav: true,
      tenantLabel: '欢乐互娱有限公司',
    });

    render(<WorkspacePage />);

    expect(screen.getByText('企业协同与平台能力')).toBeInTheDocument();
    expect(screen.getByText('企业能力总览')).toBeInTheDocument();
    expect(screen.getByText('CTeam 敏捷协同')).toBeInTheDocument();
    expect(screen.getByText('共享会话')).toBeInTheDocument();
    expect(screen.getByText('共享任务')).toBeInTheDocument();
    expect(screen.getByText('CCI 流水线')).toBeInTheDocument();
    expect(screen.getByText('CAgent 智能助手')).toBeInTheDocument();
    expect(screen.getByText('组织管理后台')).toBeInTheDocument();
  });

  it('navigates to shared sessions and tasks scopes from the workspace enterprise cards', () => {
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      showEnterpriseAdminNav: true,
      tenantLabel: '欢乐互娱有限公司',
    });

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
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      showEnterpriseAdminNav: true,
      tenantLabel: '欢乐互娱有限公司',
    });
    window.sessionStorage.setItem('workspace:last-active-team-scope', JSON.stringify({ teamId: 'team-1', teamName: 'Alpha Team' }));

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

  it('keeps the workspace page clean when the user has not joined an enterprise', () => {
    render(<WorkspacePage />);

    expect(screen.queryByText('企业协同与平台能力')).not.toBeInTheDocument();
  });
});
