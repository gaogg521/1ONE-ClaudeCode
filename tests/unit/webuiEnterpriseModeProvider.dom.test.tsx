import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const configGetMock = vi.hoisted(() => vi.fn());
const configSetMock = vi.hoisted(() => vi.fn());
const getEnterpriseContextInvokeMock = vi.hoisted(() => vi.fn());
const getWebuiApiBaseUrlMock = vi.hoisted(() => vi.fn());
const getWebuiAdminBrowserOriginMock = vi.hoisted(() => vi.fn());
const openExternalUrlMock = vi.hoisted(() => vi.fn());
const syncBrowserWebuiSessionToDesktopMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
  isDesktopOperatorUser: (user: { role?: string } | null | undefined) => user?.role === 'system_admin',
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => configGetMock(...args),
    set: (...args: unknown[]) => configSetMock(...args),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    getEnterpriseContext: {
      invoke: (...args: unknown[]) => getEnterpriseContextInvokeMock(...args),
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args),
}));

vi.mock('@/renderer/utils/webuiApiBase', () => ({
  fetchWebuiApi: vi.fn(),
  getWebuiApiBaseUrl: (...args: unknown[]) => getWebuiApiBaseUrlMock(...args),
  getWebuiAdminBrowserOrigin: (...args: unknown[]) => getWebuiAdminBrowserOriginMock(...args),
}));

vi.mock('@/renderer/utils/syncBrowserWebuiSession', () => ({
  syncBrowserWebuiSessionToDesktop: (...args: unknown[]) => syncBrowserWebuiSessionToDesktopMock(...args),
  getDesktopWebuiBearerToken: vi.fn(() => null),
}));

vi.mock('@/renderer/utils/enterpriseJoinApi', () => ({
  createEnterprise: vi.fn(),
  joinEnterpriseWithCode: vi.fn(),
}));

import {
  WebuiEnterpriseModeProvider,
  useWebuiEnterpriseMode,
} from '@/renderer/hooks/webui/WebuiEnterpriseModeProvider';

describe('WebuiEnterpriseModeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockResolvedValue(undefined);
    configSetMock.mockResolvedValue(undefined);
    getWebuiApiBaseUrlMock.mockResolvedValue(null);
    useAuthMock.mockReturnValue({
      user: {
        id: 'desktop-user',
        username: 'local-member',
        role: 'member',
      },
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    getEnterpriseContextInvokeMock.mockResolvedValue({
      success: true,
      data: {
        joined: true,
        tenantId: 'tenant-acme',
        tenantName: 'Acme',
        role: 'org_admin',
        canCreateEnterprise: false,
      },
    });
  });

  it('hides admin nav for member accounts even when username is admin', async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 'web-admin',
        username: 'admin',
        role: 'member',
        tenant_id: 'default',
      },
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    getEnterpriseContextInvokeMock.mockResolvedValue({
      success: true,
      data: {
        joined: false,
        tenantId: 'default',
        tenantName: null,
        role: 'member',
        canCreateEnterprise: false,
      },
    });

    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.showEnterpriseAdminNav).toBe(false);
  });

  it('shows admin nav for system_admin before joining an enterprise', async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 'web-admin',
        username: 'admin',
        role: 'system_admin',
        tenant_id: 'default',
      },
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    getEnterpriseContextInvokeMock.mockResolvedValue({
      success: true,
      data: {
        joined: false,
        tenantId: 'default',
        tenantName: null,
        role: 'system_admin',
        canCreateEnterprise: true,
      },
    });

    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.showEnterpriseAdminNav).toBe(true);
  });

  it('prefers desktop enterprise context role when deciding admin visibility', async () => {
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.effectiveRole).toBe('org_admin');
    expect(result.current.showEnterpriseAdminNav).toBe(true);
  });

  it('refreshes enterprise context on custom events without revalidating auth again', async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      user: {
        id: 'desktop-user',
        username: 'local-member',
        role: 'member',
      },
      refresh: refreshMock,
    });

    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const initialCalls = getEnterpriseContextInvokeMock.mock.calls.length;
    window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));

    await waitFor(() =>
      expect(getEnterpriseContextInvokeMock.mock.calls.length).toBeGreaterThan(initialCalls)
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('opens admin console on the dedicated admin port', async () => {
    getWebuiAdminBrowserOriginMock.mockResolvedValue('http://127.0.0.1:25810');

    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.openEnterpriseAdminInBrowser()).resolves.toBe('opened');
    expect(openExternalUrlMock).toHaveBeenCalledWith(
      'http://127.0.0.1:25810/#/login?redirect=%2Fenterprise&mode=admin'
    );
  });

  it('opens enterprise member login with mode=enterprise in browser URL', async () => {
    getWebuiApiBaseUrlMock.mockResolvedValue('http://127.0.0.1:25809');
    getEnterpriseContextInvokeMock.mockResolvedValue({
      success: true,
      data: {
        joined: false,
        tenantId: 'default',
        tenantName: null,
        role: 'member',
        canCreateEnterprise: false,
      },
    });

    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.openEnterpriseLoginInBrowser()).resolves.toBe('opened');
    expect(openExternalUrlMock).toHaveBeenCalledWith(
      'http://127.0.0.1:25809/#/login?redirect=%2Fenterprise%2Fjoin&mode=enterprise'
    );
  });
});
