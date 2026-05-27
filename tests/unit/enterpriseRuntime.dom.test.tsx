import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const useWebuiEnterpriseModeMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => useWebuiEnterpriseModeMock(),
}));

import {
  EnterpriseRuntimeProvider,
  useEnterpriseRuntime,
} from '@/renderer/hooks/enterprise/useEnterpriseRuntime';

function enterpriseRuntimeWrapper({ children }: React.PropsWithChildren) {
  return <EnterpriseRuntimeProvider pathname='/enterprise/skills'>{children}</EnterpriseRuntimeProvider>;
}

describe('EnterpriseRuntimeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    (window as Window & { electronAPI?: unknown }).electronAPI = undefined;

    useAuthMock.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user-1',
        username: 'admin',
        role: 'system_admin',
      },
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    useWebuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      hasJoinedEnterprise: true,
      webuiApiBase: 'http://127.0.0.1:25809',
      enterpriseContext: {
        joined: true,
        tenantId: 'tenant-1',
        tenantName: 'Acme',
        role: 'system_admin',
      },
      refreshEnterpriseContext: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('allows admin modules without requiring secondary verification', async () => {
    const { result } = renderHook(() => useEnterpriseRuntime(), { wrapper: enterpriseRuntimeWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBe('ready');
    expect(result.current.issue).toBeNull();
  });

  it('exposes only member-visible nav items for non-admin users', async () => {
    useAuthMock.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user-2',
        username: 'member',
        role: 'member',
      },
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    useWebuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      hasJoinedEnterprise: true,
      webuiApiBase: 'http://127.0.0.1:25809',
      effectiveRole: 'member',
      enterpriseContext: {
        joined: true,
        tenantId: 'tenant-1',
        tenantName: 'Acme',
        role: 'member',
      },
      refreshEnterpriseContext: vi.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useEnterpriseRuntime(), { wrapper: enterpriseRuntimeWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.visibleNavItems.map((item) => item.key)).toEqual([
      'home',
      'cteam',
      'rag',
      'mcp',
      'skills',
      'milestones',
      'cpack',
      'ccode',
      'cmeas',
      'usage',
      'security',
    ]);
  });

  it('keeps admin modules ready even when enterprise elevation is unavailable', async () => {
    const { result } = renderHook(() => useEnterpriseRuntime(), { wrapper: enterpriseRuntimeWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBe('ready');
    expect(result.current.issue).toBeNull();
  });

  it('surfaces desktop webui unavailable state before modules load', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {};
    useWebuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      hasJoinedEnterprise: true,
      webuiApiBase: null,
      enterpriseContext: {
        joined: true,
        tenantId: 'tenant-1',
        tenantName: 'Acme',
        role: 'system_admin',
      },
      refreshEnterpriseContext: vi.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useEnterpriseRuntime(), { wrapper: enterpriseRuntimeWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBe('webui_unavailable');
    expect(result.current.issue?.code).toBe('webui_unavailable');
  });
});
