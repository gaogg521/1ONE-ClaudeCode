import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ pathname: '/team/team-1', search: '' }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; subject?: string }) =>
      options?.defaultValue?.replace('{{subject}}', options?.subject ?? '') || key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Message: {
    useMessage: () => [{}, <div key='message-context' />],
    success: vi.fn(),
  },
  Spin: () => <div>loading</div>,
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: undefined }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      renameTeam: {
        invoke: vi.fn(),
      },
      removeAgent: {
        invoke: vi.fn(),
      },
      conversation: {
        get: {
          invoke: vi.fn(),
        },
      },
    },
    conversation: {
      get: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  __esModule: true,
  default: ({ headerExtra }: { headerExtra?: React.ReactNode }) => <div>{headerExtra}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  __esModule: true,
  default: () => <div />,
}));

vi.mock('@/renderer/pages/team/components/TeamConfirmOverlay', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [], presetAssistants: [] }),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/team/components/TeamTabs', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/team/components/agentSelectUtils', () => ({
  agentFromKey: vi.fn(),
  resolveConversationType: vi.fn(),
  resolveTeamAgentType: vi.fn(),
}));

vi.mock('@/renderer/pages/team/hooks/TeamTabsContext', () => ({
  TeamTabsProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useTeamTabs: () => ({
    agents: [],
    activeSlotId: '',
    statusMap: new Map(),
    switchTab: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  TeamPermissionProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/renderer/pages/team/hooks/useTeamSession', () => ({
  useTeamSession: () => ({
    statusMap: new Map(),
    addAgent: vi.fn(),
    renameAgent: vi.fn(),
    mutateTeam: vi.fn(),
  }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => '',
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceHasFilesEvent: vi.fn(),
}));

import TeamPage from '@/renderer/pages/team/TeamPage';

describe('TeamPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    locationMock.pathname = '/team/team-1';
    locationMock.search = '';
  });

  it('opens shared workspace pages directly in the current team scope', () => {
    render(
      <TeamPage
        team={{
          id: 'team-1',
          userId: 'user-1',
          name: 'Alpha Team',
          workspace: '',
          workspaceMode: 'shared',
          leadAgentId: '',
          agents: [],
          createdAt: 0,
          updatedAt: 0,
        }}
      />
    );

    fireEvent.click(screen.getByText('共享会话'));
    fireEvent.click(screen.getByText('共享任务'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/sessions?scope=team&teamId=team-1&teamName=Alpha+Team');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/tasks?scope=team&teamId=team-1&teamName=Alpha+Team');
  });

  it('keeps the current super assistant issue context when opening shared workspace pages', () => {
    locationMock.search =
      '?issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE';

    render(
      <TeamPage
        team={{
          id: 'team-1',
          userId: 'user-1',
          name: 'Alpha Team',
          workspace: '',
          workspaceMode: 'shared',
          leadAgentId: '',
          agents: [],
          createdAt: 0,
          updatedAt: 0,
        }}
      />
    );

    expect(screen.getByText('当前来自超级助手 Issue：修复团队上下文深链')).toBeInTheDocument();

    fireEvent.click(screen.getByText('共享会话'));
    fireEvent.click(screen.getByText('共享任务'));

    expect(navigateMock).toHaveBeenNthCalledWith(
      1,
      '/sessions?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
    expect(navigateMock).toHaveBeenNthCalledWith(
      2,
      '/tasks?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
  });

  it('opens the current issue kanban directly from the team header when issue context exists', () => {
    locationMock.search =
      '?issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE';

    render(
      <TeamPage
        team={{
          id: 'team-1',
          userId: 'user-1',
          name: 'Alpha Team',
          workspace: '',
          workspaceMode: 'shared',
          leadAgentId: '',
          agents: [],
          createdAt: 0,
          updatedAt: 0,
        }}
      />
    );

    fireEvent.click(screen.getByText('打开当前 Issue 看板'));

    expect(navigateMock).toHaveBeenCalledWith(
      '/enterprise/cteam?teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
  });
});
