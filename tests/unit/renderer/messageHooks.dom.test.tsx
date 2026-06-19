import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useMessageLstCache,
  useRemoveMessageByMsgId,
} from '@/renderer/pages/conversation/Messages/hooks';
import { emitter } from '@/renderer/utils/emitter';

const mockGetConversationMessagesInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: (...args: unknown[]) => mockGetConversationMessagesInvoke(...args),
      },
    },
  },
}));

type TestMessage = {
  id: string;
  msg_id?: string;
  conversation_id: string;
  type: string;
  position?: string;
  status?: string;
  content: {
    content: string;
  };
  createdAt?: number;
};

const CacheProbe = ({ conversationId }: { conversationId: string }) => {
  useMessageLstCache(conversationId);
  const messages = useMessageList();
  return <pre data-testid='messages'>{JSON.stringify(messages)}</pre>;
};

const MutationProbe = () => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const messages = useMessageList();

  return (
    <div>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage(
            {
              id: 'msg-1',
              msg_id: 'msg-1',
              conversation_id: 'conv-1',
              type: 'text',
              position: 'right',
              content: { content: 'queued message' },
            },
            true
          )
        }
      >
        add-message
      </button>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage(
            {
              id: 'msg-1',
              msg_id: 'msg-1',
              conversation_id: 'conv-1',
              type: 'text',
              position: 'right',
              status: 'finish',
              content: { content: 'queued message' },
            },
            false
          )
        }
      >
        finalize-message
      </button>
      <button type='button' onClick={() => removeMessageByMsgId('msg-1')}>
        remove-message
      </button>
      <pre data-testid='mutated-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('message hooks cache merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps same-conversation streaming messages while filtering out messages from the previous conversation', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-1',
        msg_id: 'db-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'from db' },
      },
    ];

    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    const initialMessages: TestMessage[] = [
      {
        id: 'stream-1',
        msg_id: 'stream-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'streaming current conversation' },
      },
      {
        id: 'stream-2',
        msg_id: 'stream-2',
        conversation_id: 'conv-2',
        type: 'text',
        content: { content: 'streaming stale conversation' },
      },
    ];

    render(
      <MessageListProvider value={initialMessages}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent;
      expect(content).toContain('db-1');
      expect(content).toContain('stream-1');
    });

    const merged = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];

    expect(merged.map((message) => message.id)).toEqual(['db-1', 'stream-1']);
  });

  it('adds optimistic messages and removes them by msg id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('msg-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'remove-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).not.toContain('msg-1');
    });
  });

  it('updates user message status when content is unchanged', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('mutated-messages').textContent ?? '[]') as TestMessage[];
      expect(parsed[0]?.status).toBeUndefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'finalize-message' }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('mutated-messages').textContent ?? '[]') as TestMessage[];
      expect(parsed[0]?.status).toBe('finish');
    });
  });

  it('merges DB snapshot on conversation.messages.sync preferring persisted rows', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-assistant',
        msg_id: 'turn-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'CentOS terminal shows operone-deploy npm error' },
      },
    ];
    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    const staleStream: TestMessage[] = [
      {
        id: 'stream-assistant',
        msg_id: 'turn-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: {
          content: 'This looks like a Windows configuration issue in package.json based on the screenshot text...',
        },
      },
    ];

    render(
      <MessageListProvider value={staleStream}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(parsed[0]?.content.content).toContain('Windows configuration');
    });

    emitter.emit('conversation.messages.sync', { conversationId: 'conv-1' });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.content.content).toContain('CentOS terminal');
      expect(parsed[0]?.content.content).not.toContain('Windows configuration');
    });
  });

  it('conversation.messages.sync is a no-op when DB snapshot matches UI', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-assistant',
        msg_id: 'turn-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'stable reply' },
      },
    ];
    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    render(
      <MessageListProvider value={dbMessages}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('stable reply');
    });

    const before = screen.getByTestId('messages').textContent;
    emitter.emit('conversation.messages.sync', { conversationId: 'conv-1' });

    await waitFor(() => {
      expect(mockGetConversationMessagesInvoke).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByTestId('messages').textContent).toBe(before);
  });

  it('preserves in-flight UI when DB returns an empty snapshot for the conversation', async () => {
    const stale: TestMessage[] = [
      {
        id: 'old-1',
        msg_id: 'old-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'stale message' },
      },
    ];
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={stale}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('stale message');
    });

    emitter.emit('conversation.messages.sync', { conversationId: 'conv-1' });

    await waitFor(() => {
      expect(mockGetConversationMessagesInvoke).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByTestId('messages').textContent).toContain('stale message');
  });

  it('keeps user and assistant as separate bubbles when turn msg_id matches', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    const TurnProbe = () => {
      const addOrUpdateMessage = useAddOrUpdateMessage();
      const messages = useMessageList();

      return (
        <div>
          <button
            type='button'
            onClick={() => {
              addOrUpdateMessage(
                {
                  id: 'turn-1',
                  msg_id: 'turn-1',
                  conversation_id: 'conv-1',
                  type: 'text',
                  position: 'right',
                  content: { content: '你好啊' },
                },
                true
              );
              addOrUpdateMessage({
                id: 'asst-1',
                msg_id: 'turn-1',
                conversation_id: 'conv-1',
                type: 'text',
                position: 'left',
                content: { content: '讲个故事' },
              });
            }}
          >
            add-turn
          </button>
          <pre data-testid='turn-messages'>{JSON.stringify(messages)}</pre>
        </div>
      );
    };

    render(
      <MessageListProvider value={[]}>
        <TurnProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-turn' }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('turn-messages').textContent ?? '[]') as TestMessage[];
      expect(parsed).toHaveLength(2);
      expect(parsed.find((m) => m.position === 'right')?.content.content).toBe('你好啊');
      expect(parsed.find((m) => m.position === 'left')?.content.content).toBe('讲个故事');
    });
  });

  it('removeMessageByMsgId only rolls back the user bubble for a shared turn id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    const RemoveProbe = () => {
      const addOrUpdateMessage = useAddOrUpdateMessage();
      const removeMessageByMsgId = useRemoveMessageByMsgId();
      const messages = useMessageList();

      return (
        <div>
          <button
            type='button'
            onClick={() => {
              addOrUpdateMessage(
                {
                  id: 'turn-1',
                  msg_id: 'turn-1',
                  conversation_id: 'conv-1',
                  type: 'text',
                  position: 'right',
                  content: { content: 'failed send' },
                },
                true
              );
              addOrUpdateMessage({
                id: 'asst-1',
                msg_id: 'turn-1',
                conversation_id: 'conv-1',
                type: 'text',
                position: 'left',
                content: { content: 'partial reply' },
              });
            }}
          >
            seed-turn
          </button>
          <button type='button' onClick={() => removeMessageByMsgId('turn-1')}>
            rollback-user
          </button>
          <pre data-testid='rollback-messages'>{JSON.stringify(messages)}</pre>
        </div>
      );
    };

    render(
      <MessageListProvider value={[]}>
        <RemoveProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'seed-turn' }));

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('rollback-messages').textContent ?? '[]')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'rollback-user' }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('rollback-messages').textContent ?? '[]') as TestMessage[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.position).toBe('left');
      expect(parsed[0]?.content.content).toBe('partial reply');
    });
  });

  it('add=true upserts duplicate user bubble instead of appending twice', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    const DuplicateAddProbe = () => {
      const addOrUpdateMessage = useAddOrUpdateMessage();
      const messages = useMessageList();

      return (
        <div>
          <button
            type='button'
            onClick={() => {
              addOrUpdateMessage(
                {
                  id: 'user-1',
                  msg_id: 'turn-1',
                  conversation_id: 'conv-1',
                  type: 'text',
                  position: 'right',
                  content: { content: 'hello' },
                },
                true
              );
              addOrUpdateMessage(
                {
                  id: 'user-1',
                  msg_id: 'turn-1',
                  conversation_id: 'conv-1',
                  type: 'text',
                  position: 'right',
                  content: { content: 'hello patched' },
                },
                true
              );
            }}
          >
            duplicate-add
          </button>
          <pre data-testid='dup-messages'>{JSON.stringify(messages)}</pre>
        </div>
      );
    };

    render(
      <MessageListProvider value={[]}>
        <DuplicateAddProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'duplicate-add' }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId('dup-messages').textContent ?? '[]') as TestMessage[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.content.content).toBe('hello patched');
    });
  });
});
