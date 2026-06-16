/**
 * L3 Smoke Test — aionrs JSON stream + upstream model.
 *
 * Uses production Electron config when present (Windows: %APPDATA%/1ONE ClaudeCode).
 * Skips when no API credentials are configured.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSpawnConfig } from '../../src/process/agent/aionrs/envBuilder';
import { resolveAionrsBinary } from '../../src/process/agent/aionrs/binaryResolver';
import { decodeConfigFile } from '../../src/process/utils/configMigration';
import type { TProviderWithModel } from '@/common/config/storage';

const SMOKE_TIMEOUT_MS = 25_000;

function prodConfigPath(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    const candidates = [
      join(appData, '1ONE ClaudeCode', 'config', 'one-config.txt'),
      join(appData, '1OneClaudeCode-Dev', 'config', 'one-config.txt'),
      join(appData, '1one', 'config', 'one-config.txt'),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }
  return null;
}

function pickModel(config: ReturnType<typeof decodeConfigFile>): TProviderWithModel | null {
  const providers = config['model.config'] ?? [];
  for (const p of providers) {
    const modelNames = Array.isArray(p.model) ? p.model : p.modelList?.map((m) => m.name) ?? [];
    const modelName = p.useModel || modelNames[0];
    if (!modelName || !p.apiKey?.trim()) continue;
    return { ...p, useModel: modelName };
  }
  return null;
}

function waitForEvent(
  child: ChildProcess,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    const timer = setTimeout(() => {
      rl.close();
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (predicate(msg)) {
          clearTimeout(timer);
          rl.close();
          resolve(msg);
        }
      } catch {
        // ignore non-json
      }
    });
  });
}

describe('L3 aionrs Smoke Test', () => {
  let child: ChildProcess | null = null;
  let workspace: string | null = null;

  afterEach(() => {
    if (child && !child.killed) child.kill();
    child = null;
    if (workspace) {
      try {
        rmSync(workspace, { recursive: true, force: true });
      } catch {
        // ignore
      }
      workspace = null;
    }
  });

  async function runSmoke(modelName: string): Promise<void> {
    const configPath = prodConfigPath();
    if (!configPath) {
      console.log('[aionrs-smoke] skip: no production config found');
      return;
    }

    const model = pickModel(decodeConfigFile(configPath));
    if (!model) {
      console.log('[aionrs-smoke] skip: no provider with apiKey in', configPath);
      return;
    }
    model.useModel = modelName;

    const binaryPath =
      resolveAionrsBinary() ??
      path.join(
        process.cwd(),
        'resources',
        'bundled-aionrs',
        `${process.platform}-${process.arch}`,
        process.platform === 'win32' ? 'aionrs.exe' : 'aionrs'
      );
    if (!existsSync(binaryPath)) {
      console.log('[aionrs-smoke] skip: aionrs binary not found');
      return;
    }

    workspace = mkdtempSync(join(tmpdir(), 'aionrs-smoke-'));
    const { args, env } = buildSpawnConfig(model, {
      workspace,
      autoApprove: true,
      sessionId: `smoke-${Date.now()}`,
    });

    console.log(`[aionrs-smoke] model=${model.useModel} provider=${model.platform} binary=${binaryPath}`);

    child = spawn(binaryPath, args, {
      cwd: workspace,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    await waitForEvent(child, (m) => m.type === 'ready', SMOKE_TIMEOUT_MS);

    const msgId = `msg-${Date.now()}`;
    child.stdin!.write(JSON.stringify({ type: 'message', msg_id: msgId, input: '你好，请用一句话回复。' }) + '\n');

    const endEvent = await waitForEvent(
      child,
      (m) => m.type === 'stream_end' && m.msg_id === msgId,
      SMOKE_TIMEOUT_MS
    );

    expect(endEvent.type).toBe('stream_end');
    console.log(`[aionrs-smoke] ok stream_end for ${modelName}`);
  }

  it('claude-sonnet-4-6 responds to 你好', async () => {
    await runSmoke('claude-sonnet-4-6');
  }, SMOKE_TIMEOUT_MS * 2 + 5000);

  it('minimax-2-7 responds to 你好', async () => {
    await runSmoke('minimax-2-7');
  }, SMOKE_TIMEOUT_MS * 2 + 5000);

  it('qwen-3-6-plus responds to 你好', async () => {
    await runSmoke('qwen-3-6-plus');
  }, SMOKE_TIMEOUT_MS * 2 + 5000);
});
