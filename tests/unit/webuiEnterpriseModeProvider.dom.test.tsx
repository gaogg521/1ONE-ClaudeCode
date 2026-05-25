import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const configGetMock = vi.hoisted(() => vi.fn());
const configSetMock = vi.hoisted(() => vi.fn());
const getEnterpriseContextInvokeMock = vi.hoisted(() => vi.fn());
const getWebuiApiBaseUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
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
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/webuiApiBase', () => ({
  fetchWebuiApi: vi.fn(),
  getWebuiApiBaseUrl: (...args: unknown[]) => getWebuiApiBaseUrlMock(...args),
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

  it('prefers desktop enterprise context role when deciding admin visibility', async () => {
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WebuiEnterpriseModeProvider>{children}</WebuiEnterpriseModeProvider>
    );

    const { result } = renderHook(() => useWebuiEnterpriseMode(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.effectiveRole).toBe('org_admin');
    expect(result.current.showEnterpriseAdminNav).toBe(true);
  });
});
