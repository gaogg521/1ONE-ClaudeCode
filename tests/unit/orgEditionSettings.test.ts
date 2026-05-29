/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrgEditionSettings, setOrgEditionSettings } from '@/process/webserver/auth/orgEditionSettings';
import { AuthProviderRepository } from '@/process/webserver/auth/repository/AuthProviderRepository';

vi.mock('@/process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {
    getProvider: vi.fn(),
    setProvider: vi.fn(),
  },
}));

describe('orgEditionSettings', () => {
  beforeEach(() => {
    vi.mocked(AuthProviderRepository.getProvider).mockReset();
    vi.mocked(AuthProviderRepository.setProvider).mockReset();
  });

  it('defaults edition switcher to disabled when local provider missing', async () => {
    vi.mocked(AuthProviderRepository.getProvider).mockResolvedValue(null);
    await expect(getOrgEditionSettings()).resolves.toEqual({ editionSwitcherEnabled: false });
  });

  it('reads editionSwitcherEnabled from local provider config', async () => {
    vi.mocked(AuthProviderRepository.getProvider).mockResolvedValue({
      provider: 'local',
      enabled: true,
      config: { editionSwitcherEnabled: true },
      updated_at: 1,
    });
    await expect(getOrgEditionSettings()).resolves.toEqual({ editionSwitcherEnabled: true });
  });

  it('persists edition switcher flag on local provider row', async () => {
    vi.mocked(AuthProviderRepository.getProvider).mockResolvedValue({
      provider: 'local',
      enabled: false,
      config: {},
      updated_at: 1,
    });
    await setOrgEditionSettings({ editionSwitcherEnabled: true });
    expect(AuthProviderRepository.setProvider).toHaveBeenCalledWith('local', true, {
      editionSwitcherEnabled: true,
    });
  });
});
