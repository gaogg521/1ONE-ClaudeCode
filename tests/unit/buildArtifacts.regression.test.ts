/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');

function readIfExists(relativePath: string): string | null {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('build artifacts regression (requires npm run build:webui && npm run build:mcp)', () => {
  it('main bundle injects ONE_CONV for image analysis fallback', () => {
    const main = readIfExists('out/main/index.js');
    expect(main, 'missing out/main/index.js — run npm run build:webui').toBeTruthy();
    expect(main).toContain('ONE_CONV_PLATFORM');
    expect(main).toContain('ONE_CONV_MODEL');
  });

  it('MCP image-gen bundle prefers vision chat model when analyzing', () => {
    const mcp = readIfExists('out/main/builtin-mcp-image-gen.js');
    expect(mcp, 'missing out/main/builtin-mcp-image-gen.js — run npm run build:mcp').toBeTruthy();
    expect(mcp).toContain('modelSupportsNativeVision');
    expect(mcp).toContain('isImageGenerationOnlyModel');
    expect(mcp!.length).toBeGreaterThan(80_000);
  });

  it('renderer bundle emits conversation.messages.sync on finish', () => {
    const assetsDir = path.join(ROOT, 'out/renderer/assets');
    expect(fs.existsSync(assetsDir), 'missing out/renderer/assets — run npm run build:webui').toBe(true);
    const chunks = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
    const hit = chunks.some((name) => {
      const text = fs.readFileSync(path.join(assetsDir, name), 'utf-8');
      return text.includes('conversation.messages.sync') && text.includes('requestAnimationFrame');
    });
    expect(hit).toBe(true);
  });
});
