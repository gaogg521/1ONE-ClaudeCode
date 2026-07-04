import { describe, expect, it, vi } from 'vitest';
import { navigateAfterEditionSwitch } from '@/renderer/utils/editionSwitchNavigation';

describe('navigateAfterEditionSwitch', () => {
  it('routes desktop operator on joined instance to workspace instead of join', () => {
    const navigate = vi.fn();
    navigateAfterEditionSwitch({
      next: 'enterprise',
      navigate,
      isDesktop: true,
      hasJoinedEnterprise: false,
      hasInstanceEnterprise: true,
      isAuthenticated: true,
      isDesktopOperator: true,
    });
    // 90305cfe: default landing changed from session list (/sessions) to chat input (/guid)
    expect(navigate).toHaveBeenCalledWith('/guid', undefined);
  });

  it('routes unjoined desktop instance to join for regular members', () => {
    const navigate = vi.fn();
    navigateAfterEditionSwitch({
      next: 'enterprise',
      navigate,
      isDesktop: true,
      hasJoinedEnterprise: false,
      hasInstanceEnterprise: true,
      isAuthenticated: true,
      isDesktopOperator: false,
    });
    expect(navigate).toHaveBeenCalledWith('/enterprise/join', undefined);
  });

  it('routes unjoined standalone desktop instance to join', () => {
    const navigate = vi.fn();
    navigateAfterEditionSwitch({
      next: 'enterprise',
      navigate,
      isDesktop: true,
      hasJoinedEnterprise: false,
      hasInstanceEnterprise: false,
      isAuthenticated: true,
      isDesktopOperator: false,
    });
    expect(navigate).toHaveBeenCalledWith('/enterprise/join', undefined);
  });
});
