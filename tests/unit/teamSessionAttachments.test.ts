/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTeam, TeamAgent } from '@/common/types/teamTypes';

const { sendConversationMessage } = vi.hoisted(() => ({
  sendConversationMessage: vi.fn(),
}));

vi.mock('@process/bridge/services/conversationSendService', () => ({
  sendConversationMessage,
}));

import { TeamSessionService } from '@process/team/TeamSessionService';

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'lead-slot',
    conversationId: 'conv-lead',
    role: 'lead',
    agentType: 'aionrs',
    agentName: 'Lead',
    conversationType: 'aionrs',
    status: 'idle',
    ...overrides,
  };
}

describe('TeamSessionService attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendConversationMessage.mockResolvedValue({
      success: true,
      data: { input: 'summarize', files: ['C:/workspace/report.pdf'] },
    });
  });

  it('routes team messages with files through conversation send pipeline', async () => {
    const team: TTeam = {
      id: 'team-1',
      name: 'Team',
      leadAgentId: 'lead-slot',
      agents: [makeAgent()],
      workspace: 'C:/workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const repo = {
      findById: vi.fn(async () => team),
      create: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMailboxByTeam: vi.fn(),
      deleteTasksByTeam: vi.fn(),
      writeMessage: vi.fn(),
      readUnread: vi.fn(),
      markRead: vi.fn(),
      getMailboxHistory: vi.fn(),
      createTask: vi.fn(),
      findTaskById: vi.fn(),
      updateTask: vi.fn(),
      findTasksByTeam: vi.fn(),
      findTasksByOwner: vi.fn(),
      deleteTask: vi.fn(),
    };

    const workerTaskManager = {
      getOrBuildTask: vi.fn(),
    };
    const conversationService = {
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(),
      getConversation: vi.fn(),
      createWithMigration: vi.fn(),
      listAllConversations: vi.fn(),
    };

    const service = new TeamSessionService(repo as never, workerTaskManager as never, conversationService as never);

    await service.sendMessage('team-1', 'summarize', undefined, ['C:/tmp/report.pdf']);

    expect(sendConversationMessage).toHaveBeenCalledWith(workerTaskManager, {
      conversation_id: 'conv-lead',
      input: 'summarize',
      msg_id: expect.any(String),
      files: ['C:/tmp/report.pdf'],
    });
  });

  it('routes direct agent team messages with files through conversation send pipeline', async () => {
    const team: TTeam = {
      id: 'team-1',
      name: 'Team',
      leadAgentId: 'lead-slot',
      agents: [makeAgent(), makeAgent({ slotId: 'worker-slot', conversationId: 'conv-worker', role: 'teammate' })],
      workspace: 'C:/workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const repo = {
      findById: vi.fn(async () => team),
      create: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMailboxByTeam: vi.fn(),
      deleteTasksByTeam: vi.fn(),
      writeMessage: vi.fn(),
      readUnread: vi.fn(),
      markRead: vi.fn(),
      getMailboxHistory: vi.fn(),
      createTask: vi.fn(),
      findTaskById: vi.fn(),
      updateTask: vi.fn(),
      findTasksByTeam: vi.fn(),
      findTasksByOwner: vi.fn(),
      deleteTask: vi.fn(),
    };

    const workerTaskManager = {
      getOrBuildTask: vi.fn(),
    };
    const conversationService = {
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(),
      getConversation: vi.fn(),
      createWithMigration: vi.fn(),
      listAllConversations: vi.fn(),
    };

    const service = new TeamSessionService(repo as never, workerTaskManager as never, conversationService as never);

    await service.sendMessageToAgent('team-1', 'worker-slot', 'review', undefined, ['C:/tmp/plan.pdf']);

    expect(sendConversationMessage).toHaveBeenCalledWith(workerTaskManager, {
      conversation_id: 'conv-worker',
      input: 'review',
      msg_id: expect.any(String),
      files: ['C:/tmp/plan.pdf'],
    });
  });
});
