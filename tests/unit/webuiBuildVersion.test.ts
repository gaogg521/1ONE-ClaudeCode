import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('WebUI build version recovery', () => {
  it('injects a build id and fetches the served build marker with a guarded refresh', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');

    expect(html).toContain('__ONE_WEBUI_BUILD_ID__');
    expect(html).toContain('window.__ONE_WEBUI_BUILD_ID = buildId');
    expect(html).toContain('./webui-build.json?ts=');
    expect(html).toContain('__one_build_mismatch_recovery_at');
    expect(html).toContain("url.searchParams.set('__one_cache_bust'");
  });

  it('configures the renderer build to emit webui-build.json', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../../electron.vite.config.ts'), 'utf8');

    expect(config).toContain('webuiBuildVersionPlugin');
    expect(config).toContain("fileName: 'webui-build.json'");
  });
});
