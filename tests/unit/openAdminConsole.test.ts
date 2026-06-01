import { beforeEach, describe, expect, it, vi } from 'vitest';

const isElectronDesktopMock = vi.fn(() => false);

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => isElectronDesktopMock(),
}));

import { openAdminConsole } from '@/renderer/utils/openAdminConsole';

describe('openAdminConsole', () => {
  beforeEach(() => {
    isElectronDesktopMock.mockReset();
    isElectronDesktopMock.mockReturnValue(false);
  });

  it('navigates in-app on WebUI', async () => {
    const navigate = vi.fn();
    const openEnterpriseAdminInBrowser = vi.fn();

    const result = await openAdminConsole({ navigate, openEnterpriseAdminInBrowser });

    expect(result).toBe('navigated');
    expect(navigate).toHaveBeenCalledWith('/enterprise/auth');
    expect(openEnterpriseAdminInBrowser).not.toHaveBeenCalled();
  });

  it('opens browser on desktop and falls back to webui settings when server is down', async () => {
    isElectronDesktopMock.mockReturnValue(true);
    const navigate = vi.fn();
    const openEnterpriseAdminInBrowser = vi.fn(async () => 'webui_not_running' as const);

    const result = await openAdminConsole({ navigate, openEnterpriseAdminInBrowser });

    expect(result).toBe('webui_not_running');
    expect(openEnterpriseAdminInBrowser).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/settings/webui');
  });
});
