import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 'user-1', username: 'alice', role: 'member' },
    logout: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({
    effectiveRole: 'member',
    showEnterpriseAdminNav: false,
    hasJoinedEnterprise: true,
    managementMode: 'enterprise',
    enterpriseContext: { tenantId: 'tenant-1', tenantName: 'Acme Corp' },
    setManagementMode: vi.fn(),
    openEnterpriseAdminInBrowser: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/enterprise/useWorkspaceUserProfile', () => ({
  useWorkspaceUserProfile: () => ({
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
  }),
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
  Dropdown: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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
  });

  it('renders username and organization in titlebar trigger', () => {
    render(<WorkspaceIdentityPanel />);
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('Acme Corp · 企业团队版')).toBeTruthy();
    expect(screen.getByText('研发中心 / 平台组')).toBeTruthy();
  });

  it('renders compact mode with avatar trigger only', () => {
    render(<WorkspaceIdentityPanel compact />);
    expect(screen.queryByText('alice')).toBeNull();
    expect(screen.queryByText('Acme Corp')).toBeNull();
    expect(screen.getByLabelText('账户与组织')).toBeTruthy();
  });
});
