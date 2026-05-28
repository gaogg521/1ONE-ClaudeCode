import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const locationMock = vi.hoisted(() => ({ pathname: '/enterprise/cteam', search: '' }));
const listRequirementsTreeMock = vi.hoisted(() => vi.fn());
const listMilestonesMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const createRequirementMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useLocation: () => locationMock,
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; count?: number | string; name?: string; subject?: string }
    ) =>
      options?.defaultValue
        ?.replace('{{count}}', String(options?.count ?? ''))
        .replace('{{name}}', options?.name ?? '')
        .replace('{{subject}}', options?.subject ?? '') || _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  EveryUser: () => <span>user</span>,
  Lightning: () => <span>light</span>,
  Plus: () => <span>plus</span>,
  Refresh: () => <span>refresh</span>,
  Setting: () => <span>setting</span>,
  Delete: () => <span>delete</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Modal = ({
    visible,
    title,
    children,
    footer,
    onOk,
    onCancel,
    okText,
    cancelText,
  }: React.PropsWithChildren<{
    visible?: boolean;
    title?: React.ReactNode;
    footer?: React.ReactNode;
    onOk?: () => void;
    onCancel?: () => void;
    okText?: React.ReactNode;
    cancelText?: React.ReactNode;
  }>) =>
    visible ? (
      <div>
        {title}
        {children}
        {footer}
        {cancelText ? <button onClick={onCancel}>{cancelText}</button> : null}
        {okText ? <button onClick={onOk}>{okText}</button> : null}
      </div>
    ) : null;
  (Modal as unknown as { confirm: ReturnType<typeof vi.fn> }).confirm = vi.fn();

  const Form = ({ children }: React.PropsWithChildren) => <form>{children}</form>;
  (Form as unknown as { Item: React.FC<React.PropsWithChildren<{ label?: React.ReactNode }>> }).Item = ({
    label,
    children,
  }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
    <div>
      {label}
      {children}
    </div>
  );

  const Grid = {
    Row: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Col: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  };

  const Select = ({
    children,
    value,
    options,
    onChange,
  }: React.PropsWithChildren<{
    value?: string;
    options?: Array<{ label: string; value: string }>;
    onChange?: (value: string) => void;
  }>) => (
    <div>
      {value ? <span>{`selected:${value}`}</span> : null}
      {options?.map((option) => (
        <button key={option.value} type='button' onClick={() => onChange?.(option.value)}>
          {option.label}
        </button>
      ))}
      {children}
    </div>
  );
  Select.Option = ({ children }: React.PropsWithChildren) => <div>{children}</div>;

  const Input = ({
    value,
    placeholder,
    onChange,
  }: {
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
  }) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
  Input.TextArea = ({
    value,
    placeholder,
    onChange,
  }: {
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );

  const Typography = {
    Title: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Paragraph: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };

  return {
    Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button onClick={onClick}>{children}</button>
    ),
    Card: ({
      children,
      title,
      extra,
    }: React.PropsWithChildren<{ title?: React.ReactNode; extra?: React.ReactNode }>) => (
      <section>
        {title}
        {extra}
        {children}
      </section>
    ),
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Form,
    Grid,
    Input,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal,
    Popconfirm: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Select,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: () => <div>loading</div>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography,
  };
});

vi.mock('@/renderer/utils/enterpriseApi/client', () => ({
  getEnterpriseActionError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  createRequirement: (...args: unknown[]) => createRequirementMock(...args),
  deleteRequirement: vi.fn(),
  listRequirementsTree: () => listRequirementsTreeMock(),
  listMilestones: () => listMilestonesMock(),
  updateRequirement: vi.fn(),
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

import AdminKanban from '@/renderer/pages/admin/AdminKanban';

describe('AdminKanban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    createRequirementMock.mockReset();
    createRequirementMock.mockResolvedValue({ id: 'feature-1' });
    listMilestonesMock.mockResolvedValue([]);
    locationMock.pathname = '/enterprise/cteam';
    locationMock.search = '';
    listRequirementsTreeMock.mockResolvedValue([
      {
        id: 'epic-1',
        tenant_id: 'tenant-1',
        parent_id: null,
        type: 'epic',
        subject: '企业协同升级',
        description: null,
        status: 'planning',
        priority: 'high',
        assigned_to: null,
        creator_id: 'user-1',
        created_at: 1,
        updated_at: 10,
        children: [
          {
            id: 'story-1',
            tenant_id: 'tenant-1',
            parent_id: 'epic-1',
            type: 'story',
            subject: '修复团队上下文深链',
            description: '让团队路由在共享工作台完整往返',
            status: 'developing',
            priority: 'urgent',
            assigned_to: 'user-1',
            creator_id: 'user-1',
            created_at: 2,
            updated_at: 20,
            children: [],
          },
        ],
      },
      {
        id: 'epic-2',
        tenant_id: 'tenant-1',
        parent_id: null,
        type: 'epic',
        subject: '超级助手协作',
        description: null,
        status: 'planning',
        priority: 'high',
        assigned_to: null,
        creator_id: 'user-1',
        created_at: 3,
        updated_at: 30,
        children: [
          {
            id: 'story-2',
            tenant_id: 'tenant-1',
            parent_id: 'epic-2',
            type: 'story',
            subject: '补齐超级助手数据接入',
            description: '让技能和运行时都进入统一中枢',
            status: 'backlog',
            priority: 'high',
            assigned_to: 'user-1',
            creator_id: 'user-1',
            created_at: 4,
            updated_at: 40,
            children: [],
          },
        ],
      },
    ]);
  });

  it('focuses the current issue card when opened with an issueId query', async () => {
    locationMock.search =
      '?teamId=team-1&teamName=Alpha+Team&issueId=story-2&issueSubject=%E8%A1%A5%E9%BD%90%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5';

    render(<AdminKanban />);

    await waitFor(() => {
      expect(listRequirementsTreeMock).toHaveBeenCalledTimes(1);
    });

    expect((await screen.findAllByText('补齐超级助手数据接入')).length).toBeGreaterThan(0);
    expect(screen.getByText('当前来自超级助手 Issue：补齐超级助手数据接入')).toBeInTheDocument();
    expect(screen.getByText('卡片详情')).toBeInTheDocument();
    expect(screen.getAllByText('让技能和运行时都进入统一中枢').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('拆解当前 Issue'));
    expect(screen.getByDisplayValue('补齐超级助手数据接入')).toBeInTheDocument();

    navigateMock.mockClear();
    fireEvent.click(screen.getAllByText('创建共享任务')[0]!);
    expect(navigateMock).toHaveBeenCalledWith(
      '/tasks?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-2&issueSubject=%E8%A1%A5%E9%BD%90%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5'
    );

    fireEvent.click(screen.getAllByText('创建共享会话')[0]!);
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/sessions?scope=team&teamId=team-1&teamName=Alpha+Team&issueId=story-2&issueSubject=%E8%A1%A5%E9%BD%90%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5'
    );

    fireEvent.click(screen.getAllByText('返回超级助手')[0]!);
    expect(navigateMock).toHaveBeenLastCalledWith('/super-assistant?tab=issues&issueId=story-2');

    fireEvent.click(screen.getByText('返回当前团队'));
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/team/team-1?issueId=story-2&issueSubject=%E8%A1%A5%E9%BD%90%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5'
    );

    fireEvent.click(screen.getByText('打开团队工作区'));
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/team/team-1?issueId=story-2&issueSubject=%E8%A1%A5%E9%BD%90%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5&workspaceTab=kanban'
    );

    fireEvent.click(screen.getByText('打开当前团队代码'));
    expect(navigateMock).toHaveBeenLastCalledWith(
      '/team/team-1?issueId=story-2&issueSubject=%E8%A1%A5%E9%BD%90%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5&workspaceTab=files'
    );
  });

  it('falls back to the default epic when the issueId query does not exist', async () => {
    locationMock.search = '?issueId=story-missing';

    render(<AdminKanban />);

    await waitFor(() => {
      expect(listRequirementsTreeMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('修复团队上下文深链')).toBeInTheDocument();
    expect(screen.queryByText('卡片详情')).not.toBeInTheDocument();
  });

  it('derives decomposition cards from the current requirement input instead of static demo content', async () => {
    render(<AdminKanban />);

    await waitFor(() => {
      expect(listRequirementsTreeMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('AI 需求一键拆单'));
    fireEvent.change(screen.getByPlaceholderText(/例如：在 1ONE Code 企业版中加一个 RAG 本地知识库/), {
      target: {
        value: `安全门户需求分析：首页
1. 首页搜索安全知识库、个人中心和通知
2. 中间 card 删除除险、紧急上报
安全知识库
1. 知识库描述补充
2. 文章类型概念删除、分类修改`,
      },
    });
    fireEvent.click(screen.getByText('AI 分析并拆解'));

    await waitFor(() => {
      expect(createRequirementMock).toHaveBeenCalled();
    });

    expect(createRequirementMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'feature',
        subject: '安全门户需求分析',
      })
    );
    expect(createRequirementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: 'feature-1',
        subject: '首页',
        description: expect.stringContaining('首页搜索安全知识库、个人中心和通知'),
      })
    );
    expect(createRequirementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: 'feature-1',
        subject: '安全知识库',
        description: expect.stringContaining('文章类型概念删除、分类修改'),
      })
    );
  });
});
