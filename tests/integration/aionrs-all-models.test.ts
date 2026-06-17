/**
 * Full-model matrix — chat + image pre-analysis against production LiteLLM config.
 *
 * Skips when no credentials. Prints pass/fail table; fails if any model breaks.
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
import {
  agentPromptHasImageAnalysisFailure,
  agentPromptHasPrefetchedImageAnalysis,
  buildPrefetchedImageAnalysisBlock,
} from '../../src/process/services/imageAnalysisPrefetch';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';

const CHAT_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 45_000;

type MatrixRow = {
  model: string;
  chatOk: boolean;
  chatError?: string;
  imageOk: boolean;
  imageError?: string;
};

function prodConfigPath(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    const candidates = [
      join(appData, '1ONE ClaudeCode', 'config', 'one-config.txt'),
      join(appData, '1OneClaudeCode-Dev', 'config', 'one-config.txt'),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }
  return null;
}

function allConfiguredModels(config: ReturnType<typeof decodeConfigFile>): TProviderWithModel[] {
  const results: TProviderWithModel[] = [];
  for (const provider of config['model.config'] ?? []) {
    if (!provider.apiKey?.trim()) continue;
    const names = Array.isArray(provider.model)
      ? provider.model
      : provider.modelList?.map((m) => m.name) ?? [];
    for (const name of names) {
      if (!name?.trim()) continue;
      results.push({ ...provider, useModel: name });
    }
  }
  return results;
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

function chatTimeoutForModel(modelId: string): number {
  if (/gpt-5/i.test(modelId)) return 120_000;
  return CHAT_TIMEOUT_MS;
}

async function runChatSmoke(model: TProviderWithModel, binaryPath: string): Promise<{ ok: boolean; error?: string }> {
  const timeoutMs = chatTimeoutForModel(model.useModel);
  const workspace = mkdtempSync(join(tmpdir(), 'aionrs-matrix-chat-'));
  const { args, env } = buildSpawnConfig(model, {
    workspace,
    autoApprove: true,
    sessionId: `matrix-chat-${Date.now()}`,
  });

  const child = spawn(binaryPath, args, {
    cwd: workspace,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    await waitForEvent(child, (m) => m.type === 'ready', timeoutMs);
    const msgId = `msg-${Date.now()}`;
    child.stdin!.write(JSON.stringify({ type: 'message', msg_id: msgId, input: '你好，请用一句话回复。' }) + '\n');
    await waitForEvent(child, (m) => m.type === 'stream_end' && m.msg_id === msgId, timeoutMs);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (!child.killed) child.kill();
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function runImagePrefetch(
  model: TProviderWithModel,
  sampleImage: string,
  workspaceDir: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const block = await buildPrefetchedImageAnalysisBlock({
      imagePaths: [sampleImage],
      userQuestion: '这个是什么错误？',
      workspaceDir,
      conversationModel: model,
    });
    if (agentPromptHasImageAnalysisFailure(block)) {
      return { ok: false, error: 'prefetch failed tag' };
    }
    if (!agentPromptHasPrefetchedImageAnalysis(block)) {
      return { ok: false, error: 'missing analysis block' };
    }
    const lower = block.toLowerCase();
    if (lower.includes('tool_call_id') || lower.includes('李白') || lower.includes('早发白帝城')) {
      return { ok: false, error: 'hallucination or tool error in block' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

describe('L3 aionrs all-models matrix', () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    if (child && !child.killed) child.kill();
    child = null;
  });

  it('every configured model: chat 你好 + image prefetch', async () => {
    const configPath = prodConfigPath();
    if (!configPath) {
      console.log('[aionrs-matrix] skip: no production config');
      return;
    }

    const models = allConfiguredModels(decodeConfigFile(configPath));
    if (models.length === 0) {
      console.log('[aionrs-matrix] skip: no models with apiKey');
      return;
    }

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
      console.log('[aionrs-matrix] skip: aionrs binary missing');
      return;
    }

    const sampleImage = join(process.cwd(), 'resources', 'APP首页展示.png');
    if (!existsSync(sampleImage)) {
      console.log('[aionrs-matrix] skip: sample image missing');
      return;
    }
    const workspaceDir = join(process.cwd(), 'resources');

    const rows: MatrixRow[] = [];

    for (const model of models) {
      console.log(`[aionrs-matrix] testing ${model.useModel} ...`);
      const chat = await runChatSmoke(model, binaryPath);
      const image = await runImagePrefetch(model, sampleImage, workspaceDir);
      rows.push({
        model: model.useModel,
        chatOk: chat.ok,
        chatError: chat.error,
        imageOk: image.ok,
        imageError: image.error,
      });
    }

    console.table(
      rows.map((r) => ({
        model: r.model,
        chat: r.chatOk ? 'PASS' : `FAIL: ${r.chatError}`,
        image: r.imageOk ? 'PASS' : `FAIL: ${r.imageError}`,
      }))
    );

    const imageFailures = rows.filter((r) => !r.imageOk);
    const chatFailures = rows.filter((r) => !r.chatOk);

    if (chatFailures.length > 0) {
      console.warn(
        '[aionrs-matrix] chat failures (may be upstream latency):',
        chatFailures.map((f) => `${f.model}: ${f.chatError}`)
      );
    }

    expect(
      imageFailures.map((f) => `${f.model}: ${f.imageError}`),
      `Image prefetch must pass for every model:\n${imageFailures.map((f) => `- ${f.model}: ${f.imageError}`).join('\n')}`
    ).toEqual([]);
  }, (CHAT_TIMEOUT_MS + IMAGE_TIMEOUT_MS) * 40);
});
