import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const authProvidersModalContentMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Typography: {},
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AuthProvidersModalContent', () => ({
  default: (props: { visibleProviders?: string[] }) => {
    authProvidersModalContentMock(props);
    return <div data-testid='auth-providers-content'>{(props.visibleProviders || []).join(',')}</div>;
  },
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModulePageHeader', () => ({
  default: ({ title, description }: { title?: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}));

import AdminAuth from '@/renderer/pages/admin/AdminAuth';

describe('AdminAuth', () => {
  it('renders auth providers and email config in one unified tab group', () => {
    render(<AdminAuth />);

    const sections = screen.getAllByTestId('auth-providers-content');

    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveTextContent('ldap,feishu,dingtalk,wecom,smtp');
  });
});
