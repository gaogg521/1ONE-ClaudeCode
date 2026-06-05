/**
 * Ensure「游戏安全专家」exists and trigger one immediate run (conversation + first message).
 *
 * Usage: bun scripts/run-game-security-expert-once.mjs
 *
 * @license Apache-2.0
 */
import { registerPlatformServices } from '../src/common/platform/index.ts';
import { NodePlatformServices } from '../src/common/platform/NodePlatformServices.ts';

registerPlatformServices(new NodePlatformServices());

const { randomUUID } = await import('node:crypto');
const { DESKTOP_OPERATOR_USER_ID } = await import('../src/common/auth/enterpriseRoles.ts');
const {
  GAME_SECURITY_DAILY_CRON_PROMPT,
  GAME_SECURITY_EXPERT_DESCRIPTION,
  GAME_SECURITY_EXPERT_INSTRUCTIONS,
  GAME_SECURITY_EXPERT_NAME,
} = await import('../src/common/digitalEmployee/presets/gameSecurityDailyReport.ts');
const { buildDigitalEmployeePresetBundle } = await import('../src/common/digitalEmployee/runFallback.ts');
const { mapPersonalAgentToPreset } = await import('../src/process/digitalEmployee/resolvePersonalAgentPreset.ts');
const { SqlitePersonalAgentRepository } = await import('../src/process/agent/personalAgentRepository.ts');
const { conversationServiceSingleton } = await import('../src/process/services/conversationServiceSingleton.ts');
const { workerTaskManager } = await import('../src/process/task/workerTaskManagerSingleton.ts');

const PROMPT = GAME_SECURITY_DAILY_CRON_PROMPT;

async function main() {
  const repo = new SqlitePersonalAgentRepository();
  const ownerUserId = DESKTOP_OPERATOR_USER_ID;

  let agent = (await repo.findAllByOwner(ownerUserId)).find((a) => a.name === GAME_SECURITY_EXPERT_NAME);
  if (!agent) {
    console.log('[run] Creating personal agent:', GAME_SECURITY_EXPERT_NAME);
    agent = await repo.create({
      ownerUserId,
      tenantId: 'default',
      name: GAME_SECURITY_EXPERT_NAME,
      description: GAME_SECURITY_EXPERT_DESCRIPTION,
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: {
        instructions: GAME_SECURITY_EXPERT_INSTRUCTIONS,
      },
    });
  } else {
    console.log('[run] Found agent:', agent.id);
    await repo.update(
      agent.id,
      {
        automationConfig: {
          ...(agent.automationConfig ?? {}),
          instructions: GAME_SECURITY_EXPERT_INSTRUCTIONS,
        },
      },
      ownerUserId
    );
    agent = (await repo.findById(agent.id, ownerUserId)) ?? agent;
  }

  const preset = mapPersonalAgentToPreset(agent);
  const bundle = buildDigitalEmployeePresetBundle(agent);
  console.log('[run] Preset ready,', bundle.presetContext.length, 'chars');

  const conversation = await conversationServiceSingleton.createConversation({
    type: 'acp',
    name: `${GAME_SECURITY_EXPERT_NAME} · 立即执行`,
    model: {},
    extra: {
      backend: 'claude',
      agentName: GAME_SECURITY_EXPERT_NAME,
      personalAgentId: agent.id,
      ownerUserId,
      tenantId: agent.tenantId,
      presetContext: preset.presetContext,
      presetRules: preset.presetContext,
      ...(preset.enabledSkills?.length ? { enabledSkills: preset.enabledSkills } : {}),
      ...(preset.preferredModelId ? { currentModelId: preset.preferredModelId } : {}),
      workspace: process.cwd(),
    },
  });

  const convId = conversation.id;
  console.log('[run] Conversation:', convId);
  console.log('[run] In app open: #/conversation/' + convId);

  const manager = await workerTaskManager.getOrBuildTask(convId);
  const msgId = randomUUID();
  await manager.sendMessage({ content: PROMPT, msg_id: msgId });
  console.log('[run] Message sent. Streaming for 90s (Ctrl+C to stop watching)...');

  await new Promise((resolve) => setTimeout(resolve, 90_000));
  console.log('[run] Finished wait window.');
}

main().catch((error) => {
  console.error('[run] Fatal:', error);
  process.exit(1);
});
