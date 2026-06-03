import { describe, expect, it, vi } from 'vitest';
import { navigateAfterEditionSwitch } from '@/renderer/utils/editionSwitchNavigation';

describe('navigateAfterEditionSwitch', () => {
  it('routes desktop operator on joined instance to sessions instead of join', () => {
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
    expect(navigate).toHaveBeenCalledWith('/sessions', undefined);
  });

  it('routes unjoined desktop instance to join', () => {
    const navigate = vi.fn();
    navigateAfterEditionSwitch({
      next: 'enterprise',
      navigate,
      isDesktop: true,
      hasJoinedEnterprise: false,
      hasInstanceEnterprise: false,
      isAuthenticated: true,
      isDesktopOperator: true,
    });
    expect(navigate).toHaveBeenCalledWith('/enterprise/join', undefined);
  });
});
