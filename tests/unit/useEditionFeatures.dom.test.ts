import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => vi.fn());
const webuiEnterpriseModeMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => webuiEnterpriseModeMock(),
}));

import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

describe('useEditionFeatures', () => {
  beforeEach(() => {
    authMock.mockReset();
    webuiEnterpriseModeMock.mockReset();
    authMock.mockReturnValue({ user: null });
  });

  it('keeps team collaboration disabled in personal edition even after joining an enterprise', () => {
    webuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      managementMode: 'standalone',
      hasInstanceEnterprise: false,
      hasJoinedEnterprise: true,
      enterpriseContext: {
        tenantId: 'tenant-1',
        tenantName: '欢乐互娱有限公司',
      },
      showEnterpriseAdminNav: true,
    });

    const { result } = renderHook(() => useEditionFeatures());

    expect(result.current.isPersonalEdition).toBe(true);
    expect(result.current.hasJoinedEnterprise).toBe(true);
    expect(result.current.showTeamsFeature).toBe(false);
    expect(result.current.showEnterpriseWorkspaceHub).toBe(true);
    expect(result.current.tenantLabel).toBe('欢乐互娱有限公司');
  });

  it('enables team collaboration only in enterprise team edition', () => {
    authMock.mockReturnValue({
      user: {
        id: 'member-1',
        username: 'member',
        tenant_id: 'tenant-1',
        role: 'member',
      },
    });
    webuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      managementMode: 'enterprise',
      hasInstanceEnterprise: true,
      hasJoinedEnterprise: true,
      enterpriseContext: {
        tenantId: 'tenant-1',
        tenantName: '欢乐互娱有限公司',
      },
      showEnterpriseAdminNav: true,
    });

    const { result } = renderHook(() => useEditionFeatures());

    expect(result.current.isEnterpriseEdition).toBe(true);
    expect(result.current.hasInstanceEnterprise).toBe(true);
    expect(result.current.showTeamsFeature).toBe(true);
    expect(result.current.showEnterpriseWorkspaceHub).toBe(true);
  });

  it('shows enterprise workspace hub for joined members without instance flag', () => {
    authMock.mockReturnValue({
      user: {
        id: 'member-1',
        username: 'member',
        tenant_id: 'tenant-1',
        role: 'member',
      },
    });
    webuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      managementMode: 'enterprise',
      hasInstanceEnterprise: false,
      hasJoinedEnterprise: true,
      enterpriseContext: {
        joined: true,
        tenantId: 'tenant-1',
        tenantName: '欢乐互娱有限公司',
      },
      showEnterpriseAdminNav: false,
    });

    const { result } = renderHook(() => useEditionFeatures());

    expect(result.current.showEnterpriseWorkspaceHub).toBe(true);
    expect(result.current.showTeamsFeature).toBe(true);
  });

  it('keeps team collaboration hidden for accounts that have not joined an enterprise', () => {
    webuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      managementMode: 'standalone',
      hasInstanceEnterprise: false,
      hasJoinedEnterprise: false,
      enterpriseContext: null,
      showEnterpriseAdminNav: false,
    });

    const { result } = renderHook(() => useEditionFeatures());

    expect(result.current.showTeamsFeature).toBe(false);
    expect(result.current.hasJoinedEnterprise).toBe(false);
  });
});
