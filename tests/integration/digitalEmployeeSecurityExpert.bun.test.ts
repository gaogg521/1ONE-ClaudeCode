/**
 * Regression: personal digital employee with security-expert instructions
 * Run: bun run test -- tests/integration/digitalEmployeeSecurityExpert.bun.test.ts
 */

import { registerPlatformServices } from '@/common/platform';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';

registerPlatformServices(new NodePlatformServices());

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, __testOnlySetDatabasePath } from '@process/services/database';
import { SqlitePersonalAgentRepository } from '@process/agent/personalAgentRepository';
import { mapPersonalAgentToPreset } from '@process/digitalEmployee/resolvePersonalAgentPreset';
import { prepareFirstMessage } from '@process/task/agentUtils';

function isBetterSqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    const probe = new BetterSqlite3(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

import {
  GAME_SECURITY_DAILY_CRON_PROMPT,
  GAME_SECURITY_EXPERT_DESCRIPTION,
  GAME_SECURITY_EXPERT_INSTRUCTIONS,
  GAME_SECURITY_EXPERT_NAME,
} from '@/common/digitalEmployee/presets/gameSecurityDailyReport';
import { buildPersonalDigitalEmployeeCronPrompt } from '@/renderer/pages/superAssistant/utils/autopilotDefaults';

describe.skipIf(!isBetterSqliteAvailable())('digital employee security expert regression', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '1one-de-agent-'));
    __testOnlySetDatabasePath(path.join(tmpDir, 'test.db'));
    await getDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('persists expert profile and resolves injectable preset for conversations', async () => {
    const repo = new SqlitePersonalAgentRepository();
    const created = await repo.create({
      ownerUserId: 'operator-1',
      tenantId: 'default',
      name: GAME_SECURITY_EXPERT_NAME,
      description: GAME_SECURITY_EXPERT_DESCRIPTION,
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: {
        instructions: GAME_SECURITY_EXPERT_INSTRUCTIONS,
        preferredModelId: 'claude-sonnet-4-20250514',
        skillIds: [],
      },
    });

    const loaded = await repo.findById(created.id, 'operator-1');
    expect(loaded?.automationConfig.instructions).toContain('不写外挂');

    const preset = mapPersonalAgentToPreset(loaded!);
    expect(preset.preferredModelId).toBe('claude-sonnet-4-20250514');
    expect(preset.presetContext).toContain('游戏安全专家');
    expect(preset.presetContext).toContain('当日风险汇总');
    expect(preset.presetContext).toContain('次日整改建议');

    const cronPrompt = buildPersonalDigitalEmployeeCronPrompt(loaded!);
    expect(cronPrompt).toContain('当日风险汇总');
    expect(cronPrompt).toContain('外挂&黑产动态');

    const firstTurn = await prepareFirstMessage(GAME_SECURITY_DAILY_CRON_PROMPT, {
      presetContext: preset.presetContext,
    });
    expect(firstTurn).toContain('[Assistant Rules');
    expect(firstTurn).toContain('外挂&黑产动态');
    expect(firstTurn).toContain(GAME_SECURITY_DAILY_CRON_PROMPT);
  });
});
