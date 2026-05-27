import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertEnterpriseSsoEnableAllowed,
  listEnabledEnterpriseSsoProviders,
} from '@process/webserver/auth/enterpriseSsoPolicy';

const getProviderMock = vi.fn();

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {
    getProvider: (...args: unknown[]) => getProviderMock(...args),
  },
}));

describe('enterpriseSsoPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists enabled SSO providers excluding current', async () => {
    getProviderMock.mockImplementation(async (provider: string) => {
      if (provider === 'feishu') {
        return { enabled: true };
      }
      if (provider === 'ldap') {
        return { enabled: true };
      }
      return { enabled: false };
    });

    await expect(listEnabledEnterpriseSsoProviders('ldap')).resolves.toEqual(['feishu']);
  });

  it('blocks enabling a second SSO provider by default', async () => {
    getProviderMock.mockImplementation(async (provider: string) => ({
      enabled: provider === 'feishu',
    }));

    await expect(
      assertEnterpriseSsoEnableAllowed({ provider: 'ldap', enabled: true })
    ).resolves.toEqual({ ok: false, conflicts: ['feishu'] });
  });

  it('allows multiple SSO providers when explicitly confirmed', async () => {
    getProviderMock.mockImplementation(async (provider: string) => ({
      enabled: provider === 'feishu',
    }));

    await expect(
      assertEnterpriseSsoEnableAllowed({
        provider: 'ldap',
        enabled: true,
        allowMultipleSso: true,
      })
    ).resolves.toEqual({ ok: true });
  });
});
