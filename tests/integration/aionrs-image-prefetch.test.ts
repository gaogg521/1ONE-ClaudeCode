/**
 * Live image pre-analysis — uses production LiteLLM config when available.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeConfigFile } from '../../src/process/utils/configMigration';
import {
  buildPrefetchedImageAnalysisBlock,
  resolveVisionAnalysisProvider,
} from '../../src/process/services/imageAnalysisPrefetch';
import type { TProviderWithModel } from '@/common/config/storage';

const TIMEOUT_MS = 90_000;

function prodConfigPath(): string | null {
  if (process.platform !== 'win32') return null;
  const appData = process.env.APPDATA || '';
  const p = join(appData, '1ONE ClaudeCode', 'config', 'one-config.txt');
  return existsSync(p) ? p : null;
}

function pickProvider(config: ReturnType<typeof decodeConfigFile>): TProviderWithModel | null {
  for (const p of config['model.config'] ?? []) {
    const names = Array.isArray(p.model) ? p.model : [];
    const useModel = p.useModel || names.find((m) => /qwen|claude|kimi|gpt/i.test(m)) || names[0];
    if (useModel && p.apiKey?.trim()) {
      return { ...p, useModel };
    }
  }
  return null;
}

describe('L3 aionrs image prefetch', () => {
  it('resolves vision provider from production config', async () => {
    const configPath = prodConfigPath();
    if (!configPath) return;

    const model = pickProvider(decodeConfigFile(configPath));
    if (!model) return;

    model.useModel = 'qwen-3-6-plus';
    const provider = await resolveVisionAnalysisProvider(model);
    expect(provider?.useModel).toBeTruthy();
    expect(provider?.apiKey).toBeTruthy();
  });

  it('pre-analyzes a local screenshot (3 runs)', async () => {
    const configPath = prodConfigPath();
    if (!configPath) {
      console.log('[image-prefetch] skip: no production config');
      return;
    }

    const model = pickProvider(decodeConfigFile(configPath));
    if (!model) {
      console.log('[image-prefetch] skip: no provider');
      return;
    }
    model.useModel = model.model?.includes('qwen-3-6-plus') ? 'qwen-3-6-plus' : model.useModel;

    const sampleImage = join(process.cwd(), 'resources', 'APP首页展示.png');
    if (!existsSync(sampleImage)) {
      console.log('[image-prefetch] skip: sample image missing');
      return;
    }

    const workspaceDir = join(process.cwd(), 'resources');
    const failures: string[] = [];

    for (let i = 1; i <= 3; i++) {
      const block = await buildPrefetchedImageAnalysisBlock({
        imagePaths: [sampleImage],
        userQuestion: '这张截图里显示了什么？用中文简短描述。',
        workspaceDir,
        conversationModel: model,
      });

      if (!block.includes('<1one-image-analysis>') || block.includes('<1one-image-analysis-failed>')) {
        failures.push(`run ${i}: empty or missing analysis block`);
        continue;
      }

      const lower = block.toLowerCase();
      const looksLikePoemHallucination =
        lower.includes('李白') || lower.includes('早发白帝城') || lower.includes('html 网页');
      if (looksLikePoemHallucination) {
        failures.push(`run ${i}: hallucination detected in block`);
        continue;
      }

      console.log(`[image-prefetch] run ${i} ok, length=${block.length}`);
    }

    expect(failures, failures.join('; ')).toEqual([]);
  }, TIMEOUT_MS * 3 + 5000);

  it('pre-analyzes with kimi-k2-6 when available in config', async () => {
    const configPath = prodConfigPath();
    if (!configPath) return;

    const model = pickProvider(decodeConfigFile(configPath));
    if (!model) return;

    const names = Array.isArray(model.model) ? model.model : [];
    if (!names.includes('kimi-k2-6')) {
      console.log('[image-prefetch] skip: kimi-k2-6 not in provider model list');
      return;
    }
    model.useModel = 'kimi-k2-6';

    const sampleImage = join(process.cwd(), 'resources', 'APP首页展示.png');
    if (!existsSync(sampleImage)) return;

    const block = await buildPrefetchedImageAnalysisBlock({
      imagePaths: [sampleImage],
      userQuestion: '这个是什么错误？',
      workspaceDir: join(process.cwd(), 'resources'),
      conversationModel: model,
    });

    expect(block).toMatch(/1one-image-analysis/);
    expect(block).not.toContain('1one-image-analysis-failed');
    expect(block.toLowerCase()).not.toContain('tool_call_id');
    console.log('[image-prefetch] kimi-k2-6 ok, length=', block.length);
  }, TIMEOUT_MS + 5000);
});
