import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: ({ stretchLayout }: { stretchLayout?: boolean }) => <div>{`stretch:${String(stretchLayout)}`}</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: ({ stretchLayout }: { stretchLayout?: boolean }) => <div>{`stretch:${String(stretchLayout)}`}</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiChat', () => ({
  __esModule: true,
  default: ({ stretchLayout }: { stretchLayout?: boolean }) => <div>{`stretch:${String(stretchLayout)}`}</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat', () => ({
  __esModule: true,
  default: ({ stretchLayout }: { stretchLayout?: boolean }) => <div>{`stretch:${String(stretchLayout)}`}</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/nanobot/NanobotChat', () => ({
  __esModule: true,
  default: ({ stretchLayout }: { stretchLayout?: boolean }) => <div>{`stretch:${String(stretchLayout)}`}</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/remote/RemoteChat', () => ({
  __esModule: true,
  default: ({ stretchLayout }: { stretchLayout?: boolean }) => <div>{`stretch:${String(stretchLayout)}`}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  __esModule: true,
  default: () => <div>chat-sider</div>,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => null,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null, isLoading: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawModelSelector', () => ({
  OpenClawModelSelector: () => null,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiSessionLogsLink', () => ({
  GeminiSessionLogsLink: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/StarOfficeMonitorCard.tsx', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: ({ content }: { content?: React.ReactNode }) => <div>{content}</div>,
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Message: {
    error: vi.fn(),
  },
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  }),
  Spin: () => <div>loading</div>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Typography: {
    Ellipsis: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  },
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span>copy</span>,
  History: () => <span>history</span>,
  Pushpin: () => <span>pin</span>,
  Star: () => <span>star</span>,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    secondary: '#999',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: () => <div>file-preview</div>,
}));

vi.mock('@renderer/components/media/HorizontalFileList', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@renderer/utils/chat/thinkTagFilter', () => ({
  stripThinkTags: (content: string) => content,
  hasThinkTags: () => false,
}));

vi.mock('@renderer/utils/chat/skillSuggestParser', () => ({
  stripSkillSuggest: (content: string) => content,
  hasSkillSuggest: () => false,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => '',
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronBadge', () => ({
  __esModule: true,
  default: () => null,
}));

import TeamChatView from '@/renderer/pages/team/components/TeamChatView';
import MessageText from '@/renderer/pages/conversation/Messages/components/MessagetText';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

describe('team chat stretch layout', () => {
  it('enables stretch layout for team chat conversations', async () => {
    render(
      <TeamChatView
        conversation={
          {
            id: 'conv-1',
            type: 'acp',
            status: 'finished',
            createTime: 1,
            modifyTime: 1,
            name: 'Claude Code',
            extra: { workspace: '/repo', backend: 'claude' },
          } as never
        }
        teamId='team-1'
      />
    );

    expect(await screen.findByText('stretch:true')).toBeInTheDocument();
  });

  it('enables stretch layout for regular conversation pages as well', async () => {
    render(
      <ChatConversation
        conversation={
          {
            id: 'conv-2',
            type: 'acp',
            status: 'finished',
            createTime: 1,
            modifyTime: 1,
            name: 'Claude Code',
            extra: { workspace: '/repo', backend: 'claude' },
          } as never
        }
      />
    );

    expect(await screen.findByText('stretch:true')).toBeInTheDocument();
  });

  it('removes the desktop message width cap in stretch layout mode', () => {
    const message = {
      id: 'msg-1',
      type: 'text',
      position: 'left',
      content: {
        content: '团队消息内容',
        teammateMessage: true,
      },
    } as never;

    const { rerender } = render(
      <ConversationProvider value={{ conversationId: 'conv-1', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    const normalBubble = screen.getByText('团队消息内容').parentElement;
    expect(normalBubble).toHaveStyle({ maxWidth: '920px' });

    rerender(
      <ConversationProvider value={{ conversationId: 'conv-1', type: 'acp', stretchLayout: true }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    const stretchBubble = screen.getByText('团队消息内容').parentElement;
    expect(stretchBubble).toHaveStyle({ maxWidth: 'none', width: '100%' });
  });
});
