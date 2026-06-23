/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildPromptAugmentationPrefix,
  composeAgentPrompt,
  copyFilesToDirectory,
  compressImagesInPlace,
} = vi.hoisted(() => ({
  buildPromptAugmentationPrefix: vi.fn(async () => ''),
  composeAgentPrompt: vi.fn((content: string) => content),
  copyFilesToDirectory: vi.fn(async () => [] as string[]),
  compressImagesInPlace: vi.fn(async (files: string[]) => files),
}));

vi.mock('@process/services/promptAugmentation', () => ({
  buildPromptAugmentationPrefix,
  composeAgentPrompt,
}));

vi.mock('@process/utils', () => ({
  copyFilesToDirectory,
}));

vi.mock('@process/services/imageCompress', () => ({
  compressImagesInPlace,
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: () => ({ cacheDir: 'C:/cache' }),
  ProcessConfig: {
    get: vi.fn(async () => false),
  },
}));

import { sendConversationMessage } from '@process/bridge/services/conversationSendService';

describe('sendConversationMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failure when conversation task cannot be built', async () => {
    const workerTaskManager = {
      getOrBuildTask: vi.fn(async () => {
        throw new Error('missing conversation');
      }),
    };

    const result = await sendConversationMessage(workerTaskManager as never, {
      conversation_id: 'conv-1',
      input: 'hello',
      msg_id: 'msg-1',
    });

    expect(result.success).toBe(false);
    expect(result.msg).toContain('missing conversation');
  });

  it('forwards resolved input and files to the agent manager', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const workerTaskManager = {
      getOrBuildTask: vi.fn(async () => ({
        type: 'aionrs',
        workspace: 'C:/workspace',
        conversation_id: 'conv-1',
        sendMessage,
      })),
    };
    copyFilesToDirectory.mockResolvedValue(['C:/workspace/report.pdf']);

    const result = await sendConversationMessage(workerTaskManager as never, {
      conversation_id: 'conv-1',
      input: 'summarize',
      msg_id: 'msg-1',
      files: ['C:/tmp/report.pdf'],
    });

    expect(result.success).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('report.pdf'),
        files: ['C:/workspace/report.pdf'],
        msg_id: 'msg-1',
      })
    );
  });
});
