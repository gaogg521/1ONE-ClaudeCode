import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import MessageAcpToolCall from '@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall';

vi.mock('@arco-design/web-react', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/media/LocalImageView', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe('MessageAcpToolCall', () => {
  it('renders image tool content from base64 payloads', () => {
    render(
      <MessageAcpToolCall
        message={{
          id: '1',
          msg_id: '1',
          conversation_id: 'conv-1',
          createdAt: Date.now(),
          position: 'left',
          type: 'acp_tool_call',
          content: {
            sessionId: 'session-1',
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-1',
              kind: 'read',
              status: 'completed',
              title: 'Read File',
              content: [
                {
                  type: 'content',
                  content: {
                    type: 'image',
                    data: 'ZmFrZS1pbWFnZQ==',
                    mimeType: 'image/png',
                  },
                },
              ],
            },
          },
        }}
      />
    );

    const image = screen.getByAltText('Tool result image');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,ZmFrZS1pbWFnZQ==');
  });
});
