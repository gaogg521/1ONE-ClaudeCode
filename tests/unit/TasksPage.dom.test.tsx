import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());
const getUserConversationsMock = vi.hoisted(() => vi.fn());
const kanbanListMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ pathname: '/tasks', search: '' }));

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
  Edit: () => <span>edit</span>,
  DeleteFour: () => <span>delete</span>,
  Refresh: () => <span>refresh</span>,
  Filter: () => <span>filter</span>,
}));

vi.mock('@arco-design/web-react', async () => {
  const Modal = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  (Modal as unknown as { confirm: ReturnType<typeof vi.fn> }).confirm = vi.fn();
  const Form = ({ children }: React.PropsWithChildren) => <form>{children}</form>;
  (Form as unknown as { Item: React.FC<React.PropsWithChildren> }).Item = ({
    children,
  }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button onClick={onClick}>{children}</button>
    ),
    Badge: ({ count }: { count?: React.ReactNode }) => <span>{count}</span>,
    Modal,
    Form,
    Input: ({ placeholder, value }: { placeholder?: string; value?: string }) => (
      <input placeholder={placeholder} value={value} readOnly />
    ),
    Message: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: ({ tip }: { tip?: string }) => <div>{tip || 'loading'}</div>,
    Select: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };
});

vi.mock('@/renderer/components/base/AionSelect', () => {
  const AionSelect = ({ children, value }: React.PropsWithChildren<{ value?: string }>) => (
    <div>
      {value ? <span>{`selected:${value}`}</span> : null}
      {children}
    </div>
  );
  AionSelect.Option = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    __esModule: true,
    default: AionSelect,
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: getUserConversationsMock,
      },
    },
  },
}));

vi.mock('@/renderer/utils/kanbanApi', () => ({
  kanbanApi: {
    me: vi.fn().mockResolvedValue({ id: 'u1', username: 'allen', role: 'admin' }),
    list: kanbanListMock,
    listUsers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

import TasksPage from '@/renderer/pages/tasks';

describe('TasksPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    locationMock.pathname = '/tasks';
    locationMock.search = '';
    getUserConversationsMock.mockResolvedValue([]);
    kanbanListMock.mockResolvedValue([]);
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      isEnterpriseEdition: true,
      tenantLabel: '欢乐互娱有限公司',
      showEnterpriseAdminNav: true,
    });
  });

  it('shows enterprise context inside the shared tasks workspace', async () => {
    render(<TasksPage />);

    expect(await screen.findByText('企业协同与平台能力')).toBeInTheDocument();
    expect(screen.getByText('欢乐互娱有限公司')).toBeInTheDocument();
    expect(screen.getByText('企业能力总览')).toBeInTheDocument();
    expect(screen.getByText('管理后台')).toBeInTheDocument();
  });

  it('filters tasks by personal and team collaboration scope after joining an enterprise', async () => {
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
    kanbanListMock.mockResolvedValue([
      {
        id: 'task-personal',
        user_id: 'u1',
        subject: '个人任务',
        status: 'pending',
        session_name: 'conversation-personal',
        created_at: 1710000000000,
        updated_at: 1710000000000,
      },
      {
        id: 'task-team',
        user_id: 'u1',
        subject: '团队任务',
        status: 'pending',
        session_name: 'conversation-team',
        created_at: 1710000001000,
        updated_at: 1710000001000,
      },
    ]);

    render(<TasksPage />);

    expect(await screen.findByText('个人任务')).toBeInTheDocument();
    expect(screen.getByText('团队任务')).toBeInTheDocument();

    fireEvent.click(screen.getByText('团队协同'));
    expect(screen.getByText('团队任务')).toBeInTheDocument();
    expect(screen.queryByText('个人任务')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('个人'));
    expect(screen.getByText('个人任务')).toBeInTheDocument();
    expect(screen.queryByText('团队任务')).not.toBeInTheDocument();
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
    kanbanListMock.mockResolvedValue([
      {
        id: 'task-personal',
        user_id: 'u1',
        subject: '个人任务',
        status: 'pending',
        session_name: 'conversation-personal',
        created_at: 1710000000000,
        updated_at: 1710000000000,
      },
      {
        id: 'task-team',
        user_id: 'u1',
        subject: '团队任务',
        status: 'pending',
        session_name: 'conversation-team',
        created_at: 1710000001000,
        updated_at: 1710000001000,
      },
      {
        id: 'task-other-team',
        user_id: 'u1',
        subject: '其他团队任务',
        status: 'pending',
        session_name: 'conversation-other-team',
        created_at: 1710000002000,
        updated_at: 1710000002000,
      },
    ]);

    render(<TasksPage />);

    expect(await screen.findByText('团队任务')).toBeInTheDocument();
    expect(screen.queryByText('个人任务')).not.toBeInTheDocument();
    expect(screen.queryByText('其他团队任务')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    expect(screen.getByText('当前团队视图中新建任务会默认关联到这个团队范围里的会话。')).toBeInTheDocument();
    expect(screen.getByText('团队会话')).toBeInTheDocument();
    expect(screen.queryByText('个人会话')).not.toBeInTheDocument();
    expect(screen.queryByText('其他团队会话')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('＋新任务'));
    expect(screen.getByText('selected:conversation-team')).toBeInTheDocument();

    navigateMock.mockClear();
    fireEvent.click(screen.getByText('📋 团队会话'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenLastCalledWith('/team/team-1');

    fireEvent.click(screen.getByText('返回当前团队'));
    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');

    navigateMock.mockClear();
    fireEvent.click(screen.getByText('个人'));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/tasks?scope=personal&teamId=team-1&teamName=Alpha+Team', {
      replace: true,
    });
  });

  it('shows the current issue context when opened from super assistant', async () => {
    locationMock.search =
      '?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE';

    render(<TasksPage />);

    expect(await screen.findByText('当前来自超级助手 Issue：修复团队上下文深链')).toBeInTheDocument();
    fireEvent.click(screen.getByText('基于当前 Issue 新建任务'));
    expect(screen.getByDisplayValue('修复团队上下文深链')).toBeInTheDocument();

    navigateMock.mockClear();
    fireEvent.click(screen.getByText('打开当前 Issue 看板'));
    expect(navigateMock).toHaveBeenCalledWith(
      '/enterprise/cteam?teamId=team-1&teamName=Alpha+Team&issueId=story-1&issueSubject=%E4%BF%AE%E5%A4%8D%E5%9B%A2%E9%98%9F%E4%B8%8A%E4%B8%8B%E6%96%87%E6%B7%B1%E9%93%BE'
    );
  });
});
