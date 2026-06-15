import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  status: 'authenticated',
  user: { id: 'user-1', username: 'alice', role: 'member' as const },
}));
const enterpriseModeState = vi.hoisted(() => ({
  effectiveRole: 'member',
  showEnterpriseAdminNav: false,
  hasJoinedEnterprise: true,
  hasInstanceEnterprise: true,
  managementMode: 'enterprise',
  enterpriseContext: { tenantId: 'tenant-1', tenantName: 'Acme Corp' },
  setManagementMode: vi.fn(),
  openEnterpriseAdminInBrowser: vi.fn(),
  startEnterpriseLogin: vi.fn(),
}));
const profileState = vi.hoisted(() => ({
  visible: true,
  canUploadAvatar: true,
  avatarDisplayUrl: null,
  uploadAvatar: vi.fn(),
  profile: {
    userId: 'user-1',
    username: 'alice',
    email: null,
    role: 'member',
    tenantId: 'tenant-1',
    tenantName: 'Acme Corp',
    joinedEnterprise: true,
    avatarUrl: null,
    orgUnitPath: '研发中心 / 平台组',
    teams: [{ teamId: 'team-1', teamName: 'Platform', role: 'member' }],
    updatedAt: Date.now(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown> & { defaultValue?: string }) => {
      const template = options?.defaultValue || _key;
      return Object.entries(options ?? {}).reduce((acc, [key, value]) => {
        if (key === 'defaultValue') {
          return acc;
        }
        return acc.replaceAll(`{{${key}}}`, String(value));
      }, template);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/workspace', search: '', hash: '' }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    ...authState,
    logout: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => enterpriseModeState,
}));

vi.mock('@/renderer/hooks/enterprise/useWorkspaceUserProfile', () => ({
  useWorkspaceUserProfile: () => profileState,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => false),
}));

vi.mock('@icon-park/react', () => ({
  Logout: () => <span />,
  Peoples: () => <span />,
}));

vi.mock('@arco-design/web-react', () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Divider: () => <hr />,
  Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
    <div>
      {children}
      <div data-testid='profile-menu'>{droplist}</div>
    </div>
  ),
  Menu: Object.assign(
    ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    {
      Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    }
  ),
  Message: { success: vi.fn(), error: vi.fn() },
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Typography: {
    Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Paragraph: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  },
}));

import WorkspaceIdentityPanel from '@/renderer/components/layout/WorkspaceIdentityPanel';

describe('WorkspaceIdentityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'authenticated';
    authState.user = { id: 'user-1', username: 'alice', role: 'member' };
    enterpriseModeState.effectiveRole = 'member';
    enterpriseModeState.showEnterpriseAdminNav = false;
    enterpriseModeState.hasJoinedEnterprise = true;
    enterpriseModeState.hasInstanceEnterprise = true;
    enterpriseModeState.managementMode = 'enterprise';
    enterpriseModeState.enterpriseContext = { tenantId: 'tenant-1', tenantName: 'Acme Corp' };
    profileState.visible = true;
    profileState.canUploadAvatar = true;
    profileState.avatarDisplayUrl = null;
    profileState.profile = {
      userId: 'user-1',
      username: 'alice',
      email: null,
      role: 'member',
      tenantId: 'tenant-1',
      tenantName: 'Acme Corp',
      joinedEnterprise: true,
      avatarUrl: null,
      orgUnitPath: '研发中心 / 平台组',
      teams: [{ teamId: 'team-1', teamName: 'Platform', role: 'member' }],
      updatedAt: Date.now(),
    };
  });

  it('renders username and organization in titlebar trigger', () => {
    render(<WorkspaceIdentityPanel />);
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Acme Corp · 企业团队版').length).toBeGreaterThan(0);
    expect(screen.getAllByText('研发中心 / 平台组').length).toBeGreaterThan(0);
    expect(screen.getByText('切换到个人版')).toBeTruthy();
  });

  it('renders compact mode with avatar trigger only', () => {
    render(<WorkspaceIdentityPanel compact />);
    expect(screen.getByLabelText('账户与组织').textContent).not.toContain('alice');
    expect(screen.getByLabelText('账户与组织').textContent).not.toContain('Acme Corp');
    expect(screen.getByLabelText('账户与组织')).toBeTruthy();
  });

  it('shows enterprise pending-login identity when enterprise is connected but user is not signed in', () => {
    authState.status = 'unauthenticated';
    authState.user = null;
    enterpriseModeState.hasJoinedEnterprise = false;
    enterpriseModeState.hasInstanceEnterprise = true;
    enterpriseModeState.managementMode = 'enterprise';
    enterpriseModeState.enterpriseContext = { tenantId: 'tenant-1', tenantName: 'Acme Corp' };
    profileState.profile = {
      userId: 'anonymous',
      username: 'Guest',
      email: null,
      role: 'member',
      tenantId: 'default',
      tenantName: null,
      joinedEnterprise: false,
      avatarUrl: null,
      orgUnitPath: null,
      teams: [],
      updatedAt: Date.now(),
    };

    render(<WorkspaceIdentityPanel />);
    expect(screen.getAllByText('请登录企业账号').length).toBeGreaterThan(0);
    expect(screen.getByText('Acme Corp · 登录后显示姓名与组织架构')).toBeTruthy();
  });

  it('shows join enterprise entry when user has not joined yet', () => {
    enterpriseModeState.hasJoinedEnterprise = false;
    enterpriseModeState.managementMode = 'standalone';
    profileState.profile = {
      userId: 'user-1',
      username: 'alice',
      email: null,
      role: 'member',
      tenantId: 'default',
      tenantName: null,
      joinedEnterprise: false,
      avatarUrl: null,
      orgUnitPath: null,
      teams: [],
      updatedAt: Date.now(),
    };

    render(<WorkspaceIdentityPanel />);
    expect(screen.getByText('前往加入企业')).toBeTruthy();
    expect(screen.queryByText('切换到企业团队版')).toBeNull();
  });

  it('keeps personal guest identity in personal edition even when instance is connected to enterprise', () => {
    authState.status = 'unauthenticated';
    authState.user = null;
    enterpriseModeState.hasJoinedEnterprise = true;
    enterpriseModeState.hasInstanceEnterprise = true;
    enterpriseModeState.managementMode = 'standalone';
    enterpriseModeState.enterpriseContext = { tenantId: 'tenant-1', tenantName: 'Acme Corp' };
    profileState.profile = {
      userId: 'anonymous',
      username: 'Guest',
      email: null,
      role: 'member',
      tenantId: 'default',
      tenantName: null,
      joinedEnterprise: false,
      avatarUrl: null,
      orgUnitPath: null,
      teams: [],
      updatedAt: Date.now(),
    };

    render(<WorkspaceIdentityPanel />);
    expect(screen.getByText('访客')).toBeTruthy();
    expect(screen.getByText('个人版 · 未登录')).toBeTruthy();
    expect(screen.queryByText('请登录企业账号')).toBeNull();
  });
});
