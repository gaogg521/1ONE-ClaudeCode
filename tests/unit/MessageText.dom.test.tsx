/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ONE_FILES_MARKER } from '@/common/config/constants';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: ({ content }: { content: React.ReactNode }) => <div data-testid='alert'>{content}</div>,
  Message: { error: vi.fn() },
  Spin: () => <span data-testid='pending-spin'>loading</span>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='icon-copy'>copy</span>,
}));

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='markdown'>{children}</div>,
}));

vi.mock('@renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: ({ path }: { path: string }) => <div data-testid='file-preview'>{path}</div>,
}));

vi.mock('@renderer/components/media/HorizontalFileList', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => undefined,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronBadge', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => '',
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn(),
}));

import MessageText from '@/renderer/pages/conversation/Messages/components/MessagetText';

describe('MessageText attachments', () => {
  it('shows uploading indicator for pending attachment-only messages', () => {
    render(
      <MessageText
        message={{
          id: 'msg-1',
          msg_id: 'msg-1',
          conversation_id: 'conv-1',
          type: 'text',
          position: 'right',
          status: 'pending',
          content: { content: '' },
          createdAt: Date.now(),
        }}
      />
    );

    expect(screen.getByTestId('pending-spin')).toBeInTheDocument();
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
  });

  it('renders chat file preview when workspace paths are present', () => {
    const workspacePath = 'C:\\workspace\\photo.png';
    render(
      <MessageText
        message={{
          id: 'msg-2',
          msg_id: 'msg-2',
          conversation_id: 'conv-1',
          type: 'text',
          position: 'right',
          content: { content: `${ONE_FILES_MARKER}\n${workspacePath}` },
          createdAt: Date.now(),
        }}
      />
    );

    expect(screen.getByTestId('file-preview')).toHaveTextContent(workspacePath);
  });

  it('shows text and uploading indicator for pending messages with caption', () => {
    render(
      <MessageText
        message={{
          id: 'msg-4',
          msg_id: 'msg-4',
          conversation_id: 'conv-1',
          type: 'text',
          position: 'right',
          status: 'pending',
          content: { content: 'analyze this' },
          createdAt: Date.now(),
        }}
      />
    );

    expect(screen.getByTestId('markdown')).toHaveTextContent('analyze this');
    expect(screen.getByTestId('pending-spin')).toBeInTheDocument();
  });
});
