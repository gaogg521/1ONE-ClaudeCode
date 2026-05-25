import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const conversationHistoryMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; tenant?: string }) =>
      options?.defaultValue?.replace('{{tenant}}', options?.tenant ?? '') || _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Typography: {
    Ellipsis: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => conversationHistoryMock(),
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

import WorkspacePage from '@/renderer/pages/workspace';

describe('WorkspacePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    conversationHistoryMock.mockReturnValue({
      groupedHistory: { timelineSections: [] },
      conversations: [],
    });
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: false,
      showEnterpriseAdminNav: false,
      tenantLabel: null,
    });
  });

  it('shows enterprise collaboration shortcuts inside the main workspace after joining an enterprise', () => {
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      showEnterpriseAdminNav: true,
      tenantLabel: '欢乐互娱有限公司',
    });

    render(<WorkspacePage />);

    expect(screen.getByText('企业协同与平台能力')).toBeInTheDocument();
    expect(screen.getByText('企业能力总览')).toBeInTheDocument();
    expect(screen.getByText('CTeam 敏捷协同')).toBeInTheDocument();
    expect(screen.getByText('CCI 流水线')).toBeInTheDocument();
    expect(screen.getByText('CAgent 智能助手')).toBeInTheDocument();
    expect(screen.getByText('组织管理后台')).toBeInTheDocument();
  });

  it('keeps the workspace page clean when the user has not joined an enterprise', () => {
    render(<WorkspacePage />);

    expect(screen.queryByText('企业协同与平台能力')).not.toBeInTheDocument();
  });
});
