import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());
const getUserConversationsMock = vi.hoisted(() => vi.fn());
const searchConversationMessagesMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ pathname: '/sessions', search: '' }));
const teamListMock = vi.hoisted(() => vi.fn());
const teamCreateState = vi.hoisted(() => ({
  createdTeam: {
    id: 'team-new',
    name: '新团队',
    workspace: '',
    agents: [],
    userId: 'user-1',
    workspaceMode: 'shared',
    leadAgentId: 'lead',
    createdAt: 1,
    updatedAt: 1,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; tenant?: string; subject?: string }) =>
      options?.defaultValue
        ?.replace('{{tenant}}', options?.tenant ?? '')
        .replace('{{subject}}', options?.subject ?? '') || _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationMock,
}));

vi.mock('@icon-park/react', () => ({
  Add: () => <span>add</span>,
  Search: () => <span>search</span>,
  Play: () => <span>play</span>,
  Delete: () => <span>delete</span>,
  Left: () => <span>left</span>,
  FolderOpen: () => <span>folder</span>,
  Right: () => <span>right</span>,
  Pushpin: () => <span>pin</span>,
  Star: () => <span>star</span>,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Input: ({
    placeholder,
    value,
    onChange,
  }: {
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <input
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Spin: () => <div>loading</div>,
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Typography: {
    Ellipsis: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: getUserConversationsMock,
      },
      searchConversationMessages: {
        invoke: searchConversationMessagesMock,
      },
    },
    conversation: {
      listChanged: {
        on: vi.fn(() => () => {}),
      },
      remove: {
        invoke: vi.fn(),
      },
      update: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    ready: true,
    status: 'authenticated',
    user: { id: 'user-1', role: 'member' },
    login: vi.fn(),
    loginWithLdap: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    clearAuthCache: vi.fn(),
  }),
}));

const openEnterpriseAdminInBrowserMock = vi.hoisted(() => vi.fn(async () => 'opened' as const));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({
    openEnterpriseAdminInBrowser: openEnterpriseAdminInBrowserMock,
  }),
}));

vi.mock('@/renderer/utils/openAdminConsole', () => ({
  openAdminConsole: vi.fn(async ({ navigate }: { navigate: (path: string) => void }) => {
    navigate('/enterprise');
    return 'navigated';
  }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => teamListMock(),
}));

vi.mock('@/renderer/pages/team/components/TeamCreateModal', () => ({
  default: ({
    visible,
    onClose,
    onCreated,
  }: {
    visible: boolean;
    onClose: () => void;
    onCreated: (team: typeof teamCreateState.createdTeam) => void;
  }) =>
    visible ? (
      <div>
        <div>create-team-modal</div>
        <button onClick={() => onCreated(teamCreateState.createdTeam)}>confirm-create-team</button>
        <button onClick={onClose}>close-create-team</button>
      </div>
    ) : null,
}));

import SessionsPage from '@/renderer/pages/sessions';

describe('SessionsPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    locationMock.pathname = '/sessions';
    locationMock.search = '';
    getUserConversationsMock.mockResolvedValue([]);
    searchConversationMessagesMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 0,
      pageSize: 100,
      hasMore: false,
    });
    teamListMock.mockReturnValue({
      teams: [],
      mutate: vi.fn(),
      removeTeam: vi.fn(),
    });
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      isEnterpriseEdition: true,
      showTeamsFeature: true,
      tenantLabel: '欢乐互娱有限公司',
      showEnterpriseAdminNav: true,
    });
  });

  it('shows enterprise context and entry buttons in the shared sessions workspace', () => {
    render(<SessionsPage />);

    expect(screen.getByText('企业协同与平台能力')).toBeInTheDocument();
    expect(screen.getByText('欢乐互娱有限公司')).toBeInTheDocument();
    expect(screen.getByText('企业能力总览')).toBeInTheDocument();
    expect(screen.getByText('管理后台')).toBeInTheDocument();
  });

  it('filters sessions by personal and team collaboration scope after joining an enterprise', async () => {
    getUserConversationsMock.mockResolvedValue([
      {
        id: 'conversation-personal',
        name: '个人会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000000000,
        modifyTime: 1710000000000,
        extra: { backend: 'claude' },
      },
      {
        id: 'conversation-team',
        name: '团队会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000001000,
        modifyTime: 1710000001000,
        extra: { backend: 'claude', teamId: 'team-1' },
      },
    ]);

    render(<SessionsPage />);

    expect(await screen.findByText('个人会话')).toBeInTheDocument();
    expect(screen.getByText('团队会话')).toBeInTheDocument();

    fireEvent.click(screen.getByText('团队协同'));
    expect(screen.getByText('团队会话')).toBeInTheDocument();
    expect(screen.queryByText('个人会话')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('个人'));
    expect(screen.getByText('个人会话')).toBeInTheDocument();
    expect(screen.queryByText('团队会话')).not.toBeInTheDocument();
  });

  it('opens the current team scope directly from the URL query', async () => {
    locationMock.search = '?scope=team&teamId=team-1&teamName=Alpha+Team';
    getUserConversationsMock.mockResolvedValue([
      {
        id: 'conversation-personal',
        name: '个人会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000000000,
        modifyTime: 1710000000000,
        extra: { backend: 'claude' },
      },
      {
        id: 'conversation-team',
        name: '团队会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000001000,
        modifyTime: 1710000001000,
        extra: { backend: 'claude', teamId: 'team-1' },
      },
      {
        id: 'conversation-other-team',
        name: '其他团队会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000002000,
        modifyTime: 1710000002000,
        extra: { backend: 'claude', teamId: 'team-2' },
      },
    ]);

    render(<SessionsPage />);

    expect(await screen.findByText('团队会话')).toBeInTheDocument();
    expect(screen.queryByText('个人会话')).not.toBeInTheDocument();
    expect(screen.queryByText('其他团队会话')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    expect(screen.getByText('当前团队视图中的团队会话会直接回到对应的团队协同页。')).toBeInTheDocument();

    fireEvent.click(screen.getByText('继续团队协同'));
    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');

    navigateMock.mockClear();
    fireEvent.click(screen.getByText('团队会话'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenLastCalledWith('/team/team-1');

    fireEvent.click(screen.getByText('返回当前团队'));
    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');

    navigateMock.mockClear();
    fireEvent.click(screen.getByText('个人'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/sessions?scope=personal&teamId=team-1&teamName=Alpha+Team', {
      replace: true,
    });
  });

  it('keeps the empty state action inside the current team scope', async () => {
    locationMock.search = '?scope=team&teamId=team-1&teamName=Alpha+Team';
    getUserConversationsMock.mockResolvedValue([
      {
        id: 'conversation-personal',
        name: '个人会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000000000,
        modifyTime: 1710000000000,
        extra: { backend: 'claude' },
      },
    ]);

    render(<SessionsPage />);

    expect(await screen.findByText('sessions.empty')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('继续团队协同')[0]!);
    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');
  });

  it('shows the current issue context when opened from super assistant', async () => {
    locationMock.search =
      '?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE';

    render(<SessionsPage />);

    expect(await screen.findByText('当前来自超级助手 Issue：修复团队上下文深链')).toBeInTheDocument();
    fireEvent.click(screen.getByText('打开当前 Issue 看板'));
    expect(navigateMock).toHaveBeenCalledWith(
      '/issues/story-1?teamId=team-1&teamName=Alpha+Team&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
  });

  it('opens the team creation flow when the shared sessions view has no current team', async () => {
    locationMock.search = '?scope=team';

    render(<SessionsPage />);

    expect(await screen.findByText('sessions.empty')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('新建团队会话')[0]!);
    expect(screen.getByText('create-team-modal')).toBeInTheDocument();
  });

  it('filters sessions by title and message content', async () => {
    getUserConversationsMock.mockResolvedValue([
      {
        id: 'conversation-title',
        name: '天气讨论',
        type: 'gemini',
        status: 'finished',
        createTime: 1710000000000,
        modifyTime: 1710000000000,
        extra: {},
      },
      {
        id: 'conversation-content',
        name: '未命名会话',
        type: 'gemini',
        status: 'finished',
        createTime: 1710000001000,
        modifyTime: 1710000001000,
        extra: {},
      },
      {
        id: 'conversation-other',
        name: '无关会话',
        type: 'gemini',
        status: 'finished',
        createTime: 1710000002000,
        modifyTime: 1710000002000,
        extra: {},
      },
    ]);

    searchConversationMessagesMock.mockImplementation(async ({ keyword }: { keyword: string }) => {
      if (keyword === '晴天') {
        return {
          items: [
            {
              conversation: {
                id: 'conversation-content',
                name: '未命名会话',
                type: 'gemini',
                status: 'finished',
                createTime: 1710000001000,
                modifyTime: 1710000001000,
                extra: {},
              },
              messageId: 'message-1',
              messageType: 'text',
              messageCreatedAt: 1710000001000,
              previewText: '今天是个晴天，适合出门。',
            },
          ],
          total: 1,
          page: 0,
          pageSize: 100,
          hasMore: false,
        };
      }

      return {
        items: [],
        total: 0,
        page: 0,
        pageSize: 100,
        hasMore: false,
      };
    });

    render(<SessionsPage />);

    expect(await screen.findByText('天气讨论')).toBeInTheDocument();
    expect(screen.getByText('未命名会话')).toBeInTheDocument();
    expect(screen.getByText('无关会话')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('sessions.searchPlaceholder'), {
      target: { value: '天气' },
    });

    expect(screen.getByText('天气讨论')).toBeInTheDocument();
    expect(screen.queryByText('未命名会话')).not.toBeInTheDocument();
    expect(screen.queryByText('无关会话')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('sessions.searchPlaceholder'), {
      target: { value: '晴天' },
    });

    await waitFor(
      () => {
        expect(screen.getByText('未命名会话')).toBeInTheDocument();
        expect(screen.getByText('今天是个晴天，适合出门。')).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
    expect(screen.queryByText('天气讨论')).not.toBeInTheDocument();
    expect(screen.queryByText('无关会话')).not.toBeInTheDocument();
  });

  it('navigates into the newly created team while preserving current issue context', async () => {
    locationMock.search =
      '?scope=team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE';

    render(<SessionsPage />);

    expect(await screen.findByText('当前来自超级助手 Issue：修复团队上下文深链')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('新建团队会话')[0]!);
    fireEvent.click(screen.getByText('confirm-create-team'));

    expect(navigateMock).toHaveBeenCalledWith(
      '/team/team-new?issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
  });
});
