import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const webuiEnterpriseModeMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => webuiEnterpriseModeMock(),
}));

import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

describe('useEditionFeatures', () => {
  beforeEach(() => {
    webuiEnterpriseModeMock.mockReset();
  });

  it('enables team collaboration in the shared workspace once the user has joined an enterprise', () => {
    webuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      managementMode: 'standalone',
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
    expect(result.current.showTeamsFeature).toBe(true);
    expect(result.current.tenantLabel).toBe('欢乐互娱有限公司');
  });

  it('keeps team collaboration hidden for accounts that have not joined an enterprise', () => {
    webuiEnterpriseModeMock.mockReturnValue({
      loading: false,
      managementMode: 'standalone',
      hasJoinedEnterprise: false,
      enterpriseContext: null,
      showEnterpriseAdminNav: false,
    });

    const { result } = renderHook(() => useEditionFeatures());

    expect(result.current.showTeamsFeature).toBe(false);
    expect(result.current.hasJoinedEnterprise).toBe(false);
  });
});
