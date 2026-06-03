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

const SECURITY_EXPERT = {
  name: '游戏安全情报官',
  description: '主攻游戏行业漏洞与威胁情报',
  instructions: `你是信息安全专家，主攻游戏方向的信息安全漏洞与情报搜集。
关注手游/端游反作弊、账号与支付链路、外挂与 CVE。
先列情报来源，再给出验证步骤与风险等级（Markdown）。`,
};

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
      name: SECURITY_EXPERT.name,
      description: SECURITY_EXPERT.description,
      agentType: 'claude',
      conversationType: 'acp',
      automationConfig: {
        instructions: SECURITY_EXPERT.instructions,
        preferredModelId: 'claude-sonnet-4-20250514',
        skillIds: [],
      },
    });

    const loaded = await repo.findById(created.id, 'operator-1');
    expect(loaded?.automationConfig.instructions).toContain('游戏方向');

    const preset = mapPersonalAgentToPreset(loaded!);
    expect(preset.preferredModelId).toBe('claude-sonnet-4-20250514');
    expect(preset.presetContext).toContain('信息安全专家');

    const firstTurn = await prepareFirstMessage('扫描本周某 MOBA 手游公开漏洞情报', {
      presetContext: preset.presetContext,
    });
    expect(firstTurn).toContain('[Assistant Rules');
    expect(firstTurn).toContain('情报来源');
    expect(firstTurn).toContain('扫描本周某 MOBA 手游公开漏洞情报');
  });
});
