import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track calls to prepareFirstMessageWithSkillsIndex
const { mockPrepareFirstMessage, mockAgentSendMessage, mockSkillsIndexRefresh } = vi.hoisted(() => ({
  mockPrepareFirstMessage: vi.fn(async (content: string) => `[injected] ${content}`),
  mockAgentSendMessage: vi.fn(async () => ({ success: true })),
  mockSkillsIndexRefresh: vi.fn(async (content: string) => `[index-refresh] ${content}`),
}));

// --- Module mocks ---

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: vi.fn() } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
      turnCompleted: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({ updateConversation: vi.fn() })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => null), set: vi.fn(async () => {}) },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn((fn: () => void) => {
    fn();
  }),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: () => [] }) },
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((e: unknown) => String(e)),
  uuid: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(),
  processCronInMessage: vi.fn(),
}));

vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((s: string) => s),
}));

vi.mock('@process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

// Mock hasNativeSkillSupport to use real logic for known backends
vi.mock('@process/utils/initAgent', () => ({
  hasNativeSkillSupport: vi.fn((backend: string | undefined) => {
    const supported = [
      'gemini',
      'claude',
      'codebuddy',
      'codex',
      'qwen',
      'iflow',
      'goose',
      'droid',
      'kimi',
      'vibe',
      'cursor',
    ];
    return !!backend && supported.includes(backend);
  }),
  setupAssistantWorkspace: vi.fn(),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: mockPrepareFirstMessage,
  buildSystemInstructions: vi.fn(async () => undefined),
  prepareFirstMessage: vi.fn(async (content: string, config?: { presetContext?: string }) => {
    if (config?.presetContext) {
      return `[Assistant Rules - You MUST follow these instructions]\n${config.presetContext}\n\n[User Request]\n${content}`;
    }
    return content;
  }),
  prepareSkillsIndexRefresh: mockSkillsIndexRefresh,
}));

vi.mock('@process/services/agentToolkit/config', () => ({
  getAgentToolkitConfig: vi.fn(async () => ({
    enabled: true,
    codegraphEnabled: false,
    codegraphAutoIndex: false,
    agentBrowserAutoInstall: false,
    superpowersHooksEnabled: false,
    injectSkillsForAllAgents: false,
  })),
}));

vi.mock('@process/services/agentToolkit/superpowersHooks', () => ({
  getSuperpowersSessionContext: vi.fn(async () => null),
}));

// Mock AcpAgent class
vi.mock('@process/agent/acp', () => ({
  AcpAgent: vi.fn().mockImplementation(() => ({
    sendMessage: mockAgentSendMessage,
    getModelInfo: vi.fn(() => null),
    getSessionState: vi.fn(() => null),
    stop: vi.fn(),
    kill: vi.fn(),
    on: vi.fn().mockReturnThis(),
  })),
}));

import AcpAgentManager from '@process/task/AcpAgentManager';
import { SKILLS_INDEX_REFRESH_INTERVAL } from '@process/services/agentToolkit/firstMessage';

function createManager(
  overrides: {
    backend?: string;
    customWorkspace?: boolean;
    presetContext?: string;
    enabledSkills?: string[];
  } = {}
) {
  const data = {
    conversation_id: 'test-conv',
    backend: overrides.backend ?? 'claude',
    workspace: '/tmp/test-workspace',
    customWorkspace: overrides.customWorkspace,
    presetContext: overrides.presetContext,
    enabledSkills: overrides.enabledSkills,
  };
  // @ts-expect-error - backend type narrowing
  const manager = new AcpAgentManager(data);
  return manager;
}

async function sendFirstMessage(
  manager: InstanceType<typeof AcpAgentManager>,
  content = 'Hello',
  agentPrompt?: string
) {
  // Stub initAgent to set up a mock agent without actual process bootstrapping
  const mockAgent = {
    sendMessage: mockAgentSendMessage,
    getModelInfo: vi.fn(() => null),
    on: vi.fn().mockReturnThis(),
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing private fields for test setup
  (manager as unknown as Record<string, unknown>).agent = mockAgent;
  (manager as unknown as Record<string, unknown>).bootstrap = Promise.resolve(mockAgent);

  // Override initAgent to just return the already-bootstrapped agent
  vi.spyOn(manager, 'initAgent').mockResolvedValue(mockAgent as never);

  return manager.sendMessage({ content, msg_id: 'msg-1', ...(agentPrompt !== undefined && { agentPrompt }) });
}

describe('AcpAgentManager — first-message skill injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses native skills (no prompt injection) for supported backend without customWorkspace', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
      presetContext: 'You are helpful.',
      enabledSkills: ['pptx'],
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
    // Should have injected presetContext directly into content
    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    expect(sentContent).toContain('[Assistant Rules');
    expect(sentContent).toContain('You are helpful.');
    expect(sentContent).toContain('[User Request]');
  });

  it('falls back to prompt injection for supported backend WITH customWorkspace', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: true,
      presetContext: 'You are helpful.',
      enabledSkills: ['pptx'],
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).toHaveBeenCalledWith('Hello', {
      presetContext: 'You are helpful.',
      enabledSkills: ['pptx'],
    });
  });

  it('falls back to prompt injection for unsupported backend regardless of customWorkspace', async () => {
    const manager = createManager({
      backend: 'opencode',
      customWorkspace: false,
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).toHaveBeenCalledWith('Hello', {
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });
  });

  it('applies injection ON TOP of agentPrompt when present (regression: agentPrompt used to bypass injection)', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
      presetContext: 'You are helpful.',
    });

    await sendFirstMessage(manager, 'Hello', '[augmented] Hello with attachments');

    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    // Rules must be injected into the payload that is actually sent (agentPrompt),
    // not into data.content which is then discarded.
    expect(sentContent).toContain('[Assistant Rules');
    expect(sentContent).toContain('You are helpful.');
    expect(sentContent).toContain('[augmented] Hello with attachments');
  });

  it('applies index injection on top of agentPrompt for non-native backend', async () => {
    const manager = createManager({
      backend: 'opencode',
      customWorkspace: false,
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });

    await sendFirstMessage(manager, 'Hello', '[augmented] Hello');

    expect(mockPrepareFirstMessage).toHaveBeenCalledWith('[augmented] Hello', {
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });
    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    expect(sentContent).toBe('[injected] [augmented] Hello');
  });

  it('skips presetContext injection when presetContext is undefined (native path)', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
    });

    await sendFirstMessage(manager, 'Test message');

    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    // No preset context → content should be passed through unchanged
    expect(sentContent).toBe('Test message');
  });
});

describe('AcpAgentManager — periodic skills-index refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-injects a lightweight index every SKILLS_INDEX_REFRESH_INTERVAL messages (index-injection backend)', async () => {
    const manager = createManager({
      backend: 'opencode',
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });

    await sendFirstMessage(manager, 'first');

    // Messages 2..INTERVAL do not refresh yet
    for (let i = 0; i < SKILLS_INDEX_REFRESH_INTERVAL - 1; i++) {
      await manager.sendMessage({ content: `msg-${i}`, msg_id: `msg-${i}` });
    }
    expect(mockSkillsIndexRefresh).not.toHaveBeenCalled();

    // The INTERVAL-th message after the first triggers the refresh
    await manager.sendMessage({ content: 'trigger', msg_id: 'msg-trigger' });
    expect(mockSkillsIndexRefresh).toHaveBeenCalledTimes(1);
    const sentContent = mockAgentSendMessage.mock.calls.at(-1)?.[0].content as string;
    expect(sentContent).toBe('[index-refresh] trigger');

    // Counter resets after a successful refresh — next message is plain again
    await manager.sendMessage({ content: 'after', msg_id: 'msg-after' });
    expect(mockSkillsIndexRefresh).toHaveBeenCalledTimes(1);
    expect(mockAgentSendMessage.mock.calls.at(-1)?.[0].content).toBe('after');
  });

  it('never refreshes for a native-skill backend (nothing was index-injected)', async () => {
    const manager = createManager({
      backend: 'claude',
      customWorkspace: false,
      presetContext: 'Some rules',
      enabledSkills: ['pdf'],
    });

    await sendFirstMessage(manager, 'first');
    for (let i = 0; i < SKILLS_INDEX_REFRESH_INTERVAL + 2; i++) {
      await manager.sendMessage({ content: `msg-${i}`, msg_id: `msg-${i}` });
    }

    expect(mockSkillsIndexRefresh).not.toHaveBeenCalled();
  });
});
