import { describe, expect, it, vi } from 'vitest';
import { formatAionrsProcessExitError } from '@/process/agent/aionrs/exitMessages';
import { providerModelsMatch, resolveAionrsTaskForSend } from '@/process/bridge/aionrsTaskResolver';
import type { TProviderWithModel } from '@/common/config/storage';
import type { IAgentManager } from '@process/task/IAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';

const baseModel = (useModel: string): TProviderWithModel =>
  ({
    id: 'p1',
    platform: 'custom',
    name: '自定义',
    baseUrl: 'https://litellm.example.com',
    apiKey: 'sk-test',
    model: [useModel],
    useModel,
  }) as TProviderWithModel;

function mockAionrsTask(useModel: string, bootstrap: Promise<void> = Promise.resolve()): IAgentManager {
  return {
    type: 'aionrs',
    model: baseModel(useModel),
    bootstrap,
    stop: vi.fn().mockResolvedValue(undefined),
    status: 'finished',
    workspace: '/tmp',
    conversation_id: 'conv-1',
    lastActivityAt: Date.now(),
    sendMessage: vi.fn(),
    confirm: vi.fn(),
    getConfirmations: vi.fn().mockReturnValue([]),
    kill: vi.fn(),
  } as unknown as IAgentManager;
}

describe('providerModelsMatch', () => {
  it('matches identical provider routing', () => {
    expect(providerModelsMatch(baseModel('claude-sonnet-4-6'), baseModel('claude-sonnet-4-6'))).toBe(true);
  });

  it('detects useModel drift', () => {
    expect(providerModelsMatch(baseModel('minimax-2-7'), baseModel('claude-sonnet-4-6'))).toBe(false);
  });
});

describe('formatAionrsProcessExitError', () => {
  it('does not blame API auth for exit code 0', () => {
    const msg = formatAionrsProcessExitError(0);
    expect(msg).toContain('exit code 0');
    expect(msg).not.toContain('API 认证失败');
    expect(msg).toContain('worker 被重建');
  });

  it('keeps API troubleshooting hints for non-zero exit codes', () => {
    const msg = formatAionrsProcessExitError(1);
    expect(msg).toContain('API 认证失败');
  });
});

describe('resolveAionrsTaskForSend', () => {
  it('rebuilds worker when cached model differs from DB', async () => {
    const stale = mockAionrsTask('minimax-2-7');
    const fresh = mockAionrsTask('claude-sonnet-4-6');
    const kill = vi.fn();
    const getOrBuildTask = vi.fn().mockResolvedValue(fresh);
    const workerTaskManager = {
      getTask: vi.fn().mockReturnValue(stale),
      kill,
      getOrBuildTask,
    } as unknown as IWorkerTaskManager;
    const conversationService = {
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-1',
        type: 'aionrs',
        model: baseModel('claude-sonnet-4-6'),
      }),
    } as unknown as IConversationService;

    const task = await resolveAionrsTaskForSend('conv-1', { conversationService, workerTaskManager });

    expect(stale.stop).toHaveBeenCalled();
    expect(kill).toHaveBeenCalledWith('conv-1');
    expect(getOrBuildTask).toHaveBeenCalledWith('conv-1');
    expect((task as { model: TProviderWithModel }).model.useModel).toBe('claude-sonnet-4-6');
  });

  it('rebuilds worker when bootstrap failed', async () => {
    const broken = mockAionrsTask('claude-sonnet-4-6', Promise.reject(new Error('exit 1 during init')));
    const fresh = mockAionrsTask('claude-sonnet-4-6');
    const kill = vi.fn();
    const workerTaskManager = {
      getTask: vi.fn().mockReturnValue(broken),
      kill,
      getOrBuildTask: vi.fn().mockResolvedValue(fresh),
    } as unknown as IWorkerTaskManager;
    const conversationService = {
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-1',
        type: 'aionrs',
        model: baseModel('claude-sonnet-4-6'),
      }),
    } as unknown as IConversationService;

    const task = await resolveAionrsTaskForSend('conv-1', { conversationService, workerTaskManager });

    expect(broken.stop).toHaveBeenCalled();
    expect(kill).toHaveBeenCalledWith('conv-1');
    expect(task).toBe(fresh);
  });

  it('keeps healthy worker when model matches DB', async () => {
    const healthy = mockAionrsTask('claude-sonnet-4-6');
    const kill = vi.fn();
    const getOrBuildTask = vi.fn().mockResolvedValue(healthy);
    const workerTaskManager = {
      getTask: vi.fn().mockReturnValue(healthy),
      kill,
      getOrBuildTask,
    } as unknown as IWorkerTaskManager;
    const conversationService = {
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-1',
        type: 'aionrs',
        model: baseModel('claude-sonnet-4-6'),
      }),
    } as unknown as IConversationService;

    const task = await resolveAionrsTaskForSend('conv-1', { conversationService, workerTaskManager });

    expect(kill).not.toHaveBeenCalled();
    expect(healthy.stop).not.toHaveBeenCalled();
    expect(task).toBe(healthy);
  });
});
