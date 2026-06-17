import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ pathname: '/issues', search: '' }));
const authMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());
const enterpriseModeMock = vi.hoisted(() => vi.fn());
const listRequirementsTreeMock = vi.hoisted(() => vi.fn());

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

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationMock,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => enterpriseModeMock(),
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listRequirementsTree: () => listRequirementsTreeMock(),
}));

vi.mock('@/renderer/utils/webuiApiBase', () => ({
  getWebuiApiBaseUrl: vi.fn(async () => 'http://127.0.0.1:25809'),
}));

vi.mock('@/renderer/utils/ensureDesktopWebui', () => ({
  ensureDesktopWebuiRunning: vi.fn(async () => undefined),
}));

vi.mock('@/renderer/components/layout/PageContentShell', () => ({
  default: ({ children }: React.PropsWithChildren) => <div data-testid='page-content-shell'>{children}</div>,
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
  Alert: ({ content }: { content?: React.ReactNode }) => <div>{content}</div>,
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ title, children }: React.PropsWithChildren<{ title?: React.ReactNode }>) => (
    <section>
      {title ? <div>{title}</div> : null}
      {children}
    </section>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Form: Object.assign(({ children }: React.PropsWithChildren) => <form>{children}</form>, {
    Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    useForm: () => [
      {
        setFieldsValue: vi.fn(),
        validate: vi.fn().mockResolvedValue({}),
      },
    ],
  }),
  Input: Object.assign(
    ({
      value,
      onChange,
      placeholder,
    }: {
      value?: string;
      onChange?: (value: string) => void;
      placeholder?: string;
    }) => <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />,
    {
      TextArea: ({
        value,
        onChange,
        placeholder,
      }: {
        value?: string;
        onChange?: (value: string) => void;
        placeholder?: string;
      }) => <textarea value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />,
    }
  ),
  Result: ({
    title,
    subTitle,
    extra,
  }: {
    title?: React.ReactNode;
    subTitle?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{subTitle}</div>
      {extra}
    </div>
  ),
  Select: Object.assign(({ children }: React.PropsWithChildren) => <select>{children}</select>, {
    Option: ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
      <option value={value}>{children}</option>
    ),
  }),
  Spin: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Typography: {
    Paragraph: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  },
}));

import IssuesPage from '@/renderer/pages/issues';

describe('IssuesPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    locationMock.pathname = '/issues';
    locationMock.search = '';
    enterpriseModeMock.mockReturnValue({
      startEnterpriseLogin: vi.fn(),
    });
    listRequirementsTreeMock.mockResolvedValue([
      {
        id: 'epic-1',
        tenant_id: 'tenant-1',
        parent_id: null,
        type: 'epic',
        subject: '企业工作台升级',
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
          {
            id: 'story-2',
            tenant_id: 'tenant-1',
            parent_id: 'epic-1',
            type: 'story',
            subject: '补齐超级助手数据接入',
            description: null,
            status: 'completed',
            priority: 'low',
            assigned_to: null,
            creator_id: 'user-1',
            created_at: 3,
            updated_at: 18,
            children: [],
          },
        ],
      },
    ]);
    authMock.mockReturnValue({
      status: 'authenticated',
      user: { id: 'user-1' },
    });
    editionFeaturesMock.mockReturnValue({
      hasInstanceEnterprise: true,
      hasJoinedEnterprise: true,
      isEnterpriseEdition: true,
      showTeamsFeature: true,
      tenantLabel: '欢乐互娱有限公司',
    });
  });

  it('allows personal Issues while disabling team-only actions when user has not joined enterprise', async () => {
    editionFeaturesMock.mockReturnValue({
      hasInstanceEnterprise: false,
      hasJoinedEnterprise: false,
      isEnterpriseEdition: false,
      showTeamsFeature: false,
      tenantLabel: null,
    });

    render(<IssuesPage />);
    expect(await screen.findByText('Issues')).toBeInTheDocument();
    expect(screen.getByText('修复团队上下文深链')).toBeInTheDocument();
    expect(screen.getByText('打开规划看板')).toBeDisabled();
    expect(screen.getByText('团队任务')).toBeDisabled();

    fireEvent.click(screen.getByText('打开 Agent 助手'));
    expect(navigateMock).toHaveBeenCalledWith('/super-assistant');
  });

  it('renders issue board and product entry actions', async () => {
    render(<IssuesPage />);

    expect(await screen.findByText('Issues')).toBeInTheDocument();
    expect(screen.getByText('当前企业：欢乐互娱有限公司')).toBeInTheDocument();
    expect(screen.getByText('修复团队上下文深链')).toBeInTheDocument();
    expect(screen.queryByText('补齐超级助手数据接入')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('打开 Agent 助手'));
    fireEvent.click(screen.getByText('打开规划看板'));
    fireEvent.click(screen.getByText('修复团队上下文深链'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/super-assistant');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/enterprise/cteam');
    expect(navigateMock).toHaveBeenNthCalledWith(3, '/issues/story-1');
  });

  it('supports mine filter and enterprise guest hint', async () => {
    authMock.mockReturnValue({
      status: 'unauthenticated',
      user: null,
    });
    editionFeaturesMock.mockReturnValue({
      hasInstanceEnterprise: true,
      hasJoinedEnterprise: false,
      isEnterpriseEdition: true,
      showTeamsFeature: true,
      tenantLabel: '欢乐互娱有限公司',
    });

    render(<IssuesPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          '当前实例已接入企业，但你尚未登录企业账号。登录后将显示你的姓名、组织架构，并启用「分配给我」等筛选。'
        )
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('分配给我'));
    expect(screen.getByText('当前没有可展示的 Issue，先在规划看板中创建需求或调整筛选条件。')).toBeInTheDocument();
  });
});
