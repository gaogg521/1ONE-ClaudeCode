/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => false),
}));

const fetchWebuiApiJsonMock = vi.hoisted(() => vi.fn());
const fetchWebuiApiMock = vi.hoisted(() => vi.fn());
const hasValidCsrfTokenMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/renderer/utils/webuiApiBase', () => ({
  fetchWebuiApiJson: fetchWebuiApiJsonMock,
  fetchWebuiApi: fetchWebuiApiMock,
}));

vi.mock('@process/webserver/middleware/csrfClient', () => ({
  withCsrfToken: (body: Record<string, unknown>) => body,
  hasValidCsrfToken: hasValidCsrfTokenMock,
}));

import {
  createEnterpriseInvite,
  joinEnterpriseWithCode,
  previewEnterpriseInvite,
  revokeEnterpriseInvite,
} from '@/renderer/utils/enterpriseJoinApi';

describe('enterpriseJoinApi (browser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasValidCsrfTokenMock.mockReturnValue(true);
    fetchWebuiApiMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it('previewEnterpriseInvite calls preview endpoint with encoded code', async () => {
    fetchWebuiApiJsonMock.mockResolvedValueOnce({ tenantId: 'tenant_acme', tenantName: 'Acme' });

    const data = await previewEnterpriseInvite('ABCD-1234');
    expect(data.tenantName).toBe('Acme');
    expect(fetchWebuiApiJsonMock).toHaveBeenCalledWith(
      '/api/auth/enterprise-invite/preview?code=ABCD-1234'
    );
  });

  it('joinEnterpriseWithCode posts code with CSRF body', async () => {
    fetchWebuiApiJsonMock.mockResolvedValueOnce({ tenantId: 'tenant_acme', tenantName: 'Acme' });

    const data = await joinEnterpriseWithCode('ABCD1234');
    expect(data.tenantId).toBe('tenant_acme');
    expect(fetchWebuiApiJsonMock).toHaveBeenCalledWith('/api/auth/enterprise-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABCD1234' }),
    });
  });

  it('createEnterpriseInvite maps displayCode from nested invite', async () => {
    fetchWebuiApiJsonMock.mockResolvedValueOnce({ invite: { code: 'ABCD1234' } });

    const data = await createEnterpriseInvite({ maxUses: 5, expiresInDays: 7 });
    expect(data.displayCode).toBe('ABCD-1234');
  });

  it('createEnterpriseInvite primes csrf before posting when token is missing', async () => {
    hasValidCsrfTokenMock.mockReturnValue(false);
    fetchWebuiApiJsonMock.mockResolvedValueOnce({ displayCode: 'ABCD-1234' });

    await createEnterpriseInvite({ maxUses: 1 });

    expect(fetchWebuiApiMock).toHaveBeenCalledWith('/api/auth/user');
    expect(fetchWebuiApiJsonMock).toHaveBeenCalledWith('/api/admin/enterprise/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxUses: 1 }),
    });
  });

  it('revokeEnterpriseInvite primes csrf before deleting when token is missing', async () => {
    hasValidCsrfTokenMock.mockReturnValue(false);
    fetchWebuiApiJsonMock.mockResolvedValueOnce(undefined);

    await revokeEnterpriseInvite('invite-1');

    expect(fetchWebuiApiMock).toHaveBeenCalledWith('/api/auth/user');
    expect(fetchWebuiApiJsonMock).toHaveBeenCalledWith('/api/admin/enterprise/invites/invite-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('throws when API returns an error', async () => {
    fetchWebuiApiJsonMock.mockRejectedValueOnce(new Error('Invalid code'));

    await expect(previewEnterpriseInvite('bad')).rejects.toThrow('Invalid code');
  });
});
