import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const switchTabMock = vi.hoisted(() => vi.fn());
const closeTabMock = vi.hoisted(() => vi.fn());
const closeAllTabsMock = vi.hoisted(() => vi.fn());
const closeTabsToLeftMock = vi.hoisted(() => vi.fn());
const closeTabsToRightMock = vi.hoisted(() => vi.fn());
const closeOtherTabsMock = vi.hoisted(() => vi.fn());
const openTabMock = vi.hoisted(() => vi.fn());
const cleanupSiderTooltipsMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    openTabs: [
      {
        id: 'conversation-team',
        name: '团队标签',
        workspace: '/repo/team',
        extra: { teamId: 'team-1' },
      },
      {
        id: 'conversation-personal',
        name: '个人标签',
        workspace: '/repo/personal',
      },
    ],
    activeTabId: 'conversation-personal',
    switchTab: switchTabMock,
    closeTab: closeTabMock,
    closeAllTabs: closeAllTabsMock,
    closeTabsToLeft: closeTabsToLeftMock,
    closeTabsToRight: closeTabsToRightMock,
    closeOtherTabs: closeOtherTabsMock,
    openTab: openTabMock,
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({
    cliAgents: [],
    presetAssistants: [],
    isLoading: false,
  }),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: () => cleanupSiderTooltipsMock(),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/newConversationName', () => ({
  applyDefaultConversationName: <T,>(value: T) => value,
}));

vi.mock('@/renderer/pages/conversation/utils/createConversationParams', () => ({
  buildCliAgentParams: vi.fn(),
  buildPresetAssistantParams: vi.fn(),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/guid/constants', () => ({
  CUSTOM_AVATAR_IMAGE_MAP: {},
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: { invoke: vi.fn() },
      get: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@arco-design/web-react', () => {
  const MenuComponent = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  (
    MenuComponent as unknown as {
      Item: React.FC<React.PropsWithChildren>;
      ItemGroup: React.FC<React.PropsWithChildren>;
    }
  ).Item = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  (
    MenuComponent as unknown as {
      Item: React.FC<React.PropsWithChildren>;
      ItemGroup: React.FC<React.PropsWithChildren>;
    }
  ).ItemGroup = ({ children }: React.PropsWithChildren) => <div>{children}</div>;

  return {
    Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Menu: MenuComponent,
    Message: { error: vi.fn() },
  };
});

vi.mock('@icon-park/react', () => ({
  Close: ({ onClick }: { onClick?: (event: { stopPropagation: () => void }) => void }) => (
    <button onClick={() => onClick?.({ stopPropagation: () => {} })}>close</button>
  ),
  Plus: () => <span>plus</span>,
  Pushpin: () => <span>pin</span>,
  Robot: () => <span>robot</span>,
  Star: () => <span>star</span>,
}));

import ConversationTabs from '@/renderer/pages/conversation/components/ConversationTabs';

describe('ConversationTabs', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    switchTabMock.mockReset();
    cleanupSiderTooltipsMock.mockReset();
  });

  it('opens TeamPage when switching to a team conversation tab', () => {
    render(<ConversationTabs />);

    fireEvent.click(screen.getByText('团队标签'));

    expect(cleanupSiderTooltipsMock).toHaveBeenCalledTimes(1);
    expect(switchTabMock).toHaveBeenCalledWith('conversation-team');
    expect(navigateMock).toHaveBeenCalledWith('/team/team-1');
  });
});
