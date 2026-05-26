import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const getUserConversationsMock = vi.hoisted(() => vi.fn());
const markAsReadMock = vi.hoisted(() => vi.fn());
const blockMobileInputFocusMock = vi.hoisted(() => vi.fn());
const blurActiveElementMock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: (...args: unknown[]) => getUserConversationsMock(...args),
      },
    },
    conversation: {
      remove: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({}),
}));

vi.mock('@arco-design/web-react', () => ({
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Popconfirm: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Input: ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <input value={value} onChange={(event) => onChange?.(event.target.value)} />
  ),
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  DeleteOne: () => <span>delete</span>,
  MessageOne: () => <span>message</span>,
  EditOne: () => <span>edit</span>,
}));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => <span />,
  useCronJobsMap: () => ({
    getJobStatus: () => 'none',
    markAsRead: markAsReadMock,
  }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: () => () => {},
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: () => blockMobileInputFocusMock(),
  blurActiveElement: () => blurActiveElementMock(),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({}),
}));

vi.mock('@/renderer/utils/chat/timeline', () => ({
  getActivityTime: (conversation: { modifyTime: number }) => conversation.modifyTime,
  createTimelineGrouper: () => () => '',
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import ChatHistory from '@/renderer/pages/conversation/components/ChatHistory';

describe('ChatHistory', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getUserConversationsMock.mockReset();
    markAsReadMock.mockReset();
    blockMobileInputFocusMock.mockReset();
    blurActiveElementMock.mockReset();
  });

  it('opens TeamPage when selecting a team conversation from history', async () => {
    getUserConversationsMock.mockResolvedValue([
      {
        id: 'conversation-team',
        name: '团队会话',
        type: 'acp',
        status: 'finished',
        createTime: 1710000000000,
        modifyTime: 1710000000000,
        extra: { backend: 'claude', teamId: 'team-1' },
      },
    ]);

    render(<ChatHistory />);

    const item = await screen.findByText('团队会话');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/team/team-1');
    });
    expect(blockMobileInputFocusMock).toHaveBeenCalledTimes(1);
    expect(blurActiveElementMock).toHaveBeenCalledTimes(1);
  });
});
