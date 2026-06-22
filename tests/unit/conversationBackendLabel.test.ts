import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { getConversationBackendLabel } from '@/renderer/utils/conversation/conversationBackendLabel';

describe('getConversationBackendLabel', () => {
  it('labels aionrs conversations as 1ONE CODE', () => {
    const conv = {
      id: 'c1',
      type: 'aionrs',
      name: 'test',
      extra: { workspace: '/tmp' },
    } as TChatConversation;

    expect(getConversationBackendLabel(conv)).toEqual({ label: '1ONE CODE', color: 'arcoblue' });
  });

  it('labels gemini conversations as Gemini', () => {
    const conv = {
      id: 'c2',
      type: 'gemini',
      name: 'test',
      model: { id: 'm', platform: 'gemini', useModel: 'gemini-2.5' },
      extra: { workspace: '/tmp' },
    } as TChatConversation;

    expect(getConversationBackendLabel(conv)).toEqual({ label: 'Gemini', color: 'green' });
  });

  it('labels acp conversations by backend id', () => {
    const conv = {
      id: 'c3',
      type: 'acp',
      name: 'test',
      extra: { workspace: '/tmp', backend: 'claude' },
    } as TChatConversation;

    expect(getConversationBackendLabel(conv)).toEqual({ label: 'Claude Code', color: 'blue' });
  });
});
