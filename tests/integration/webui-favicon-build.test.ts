import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { getAsarEntries, resolveDefaultAppAsarPath, toPosixPath } from './asarTestUtils';

const repoRoot = path.resolve(__dirname, '../..');

function getLatestSourceMtimeMs(files: string[]): number {
  return files.reduce((latest, file) => {
    if (!fs.existsSync(file)) return latest;
    return Math.max(latest, fs.statSync(file).mtimeMs);
  }, 0);
}

function extractFaviconHref(indexHtmlPath: string): string {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const match = html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/i);
  if (!match?.[1]) {
    throw new Error(`Favicon link not found in ${indexHtmlPath}`);
  }
  return match[1];
}

describe('Built WebUI favicon integrity', () => {
  const rendererIndexPath = path.resolve(repoRoot, 'out/renderer/index.html');
  const faviconSourceFiles = [
    path.resolve(repoRoot, 'src/renderer/index.html'),
    path.resolve(repoRoot, 'resources/icon.png'),
  ];
  const envAsar = process.env.APP_ASAR_PATH;
  const resolvedEnvAsar = envAsar ? path.resolve(envAsar) : null;
  const latestSourceMtime = getLatestSourceMtimeMs(faviconSourceFiles);
  const hasFreshRendererBuild =
    fs.existsSync(rendererIndexPath) && fs.statSync(rendererIndexPath).mtimeMs >= latestSourceMtime;

  if (resolvedEnvAsar && !fs.existsSync(resolvedEnvAsar)) {
    throw new Error(`APP_ASAR_PATH does not exist: ${resolvedEnvAsar}`);
  }

  const appAsarPath = resolvedEnvAsar || resolveDefaultAppAsarPath(repoRoot);
  const runOrSkip = hasFreshRendererBuild ? it : it.skip;

  runOrSkip('should include the built favicon asset referenced by renderer index.html', () => {
    const faviconHref = extractFaviconHref(rendererIndexPath);

    expect(faviconHref).toMatch(/^\.\/(assets|pwa)\/.+\.(png|ico|svg)$/);

    const assetRelativePath = toPosixPath(path.join('out/renderer', faviconHref.replace(/^\.\//, '')));
    const assetAbsolutePath = path.resolve(path.dirname(rendererIndexPath), faviconHref);

    expect(fs.existsSync(assetAbsolutePath)).toBe(true);

    if (appAsarPath) {
      const asarEntries = getAsarEntries(appAsarPath);
      expect(asarEntries.has(assetRelativePath)).toBe(true);
    }
  });
});
